/**
 * POST /api/recipes/:id/star — Toggle star on a recipe
 *
 * Stars if not already starred, unstars if already starred.
 * Keeps starCount in sync atomically via the same transaction.
 */
import { eq, and, sql } from 'drizzle-orm'
import { recipes, recipeStars } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const recipeId = Number(getRouterParam(event, 'id'))
  if (isNaN(recipeId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid recipe ID' })
  }

  const db = useDrizzle()!

  // Verify recipe exists and is accessible
  const [recipe] = await db
    .select({ id: recipes.id, ownerId: recipes.ownerId, visibility: recipes.visibility })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1)

  if (!recipe) {
    throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
  }
  if (recipe.visibility === 'private' && recipe.ownerId !== session.user.id) {
    throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
  }

  // Check current star state
  const [existing] = await db
    .select({ id: recipeStars.id })
    .from(recipeStars)
    .where(and(eq(recipeStars.recipeId, recipeId), eq(recipeStars.userId, session.user.id)))
    .limit(1)

  const starred = !existing

  await db.transaction(async (tx) => {
    if (existing) {
      // Unstar
      await tx
        .delete(recipeStars)
        .where(and(eq(recipeStars.recipeId, recipeId), eq(recipeStars.userId, session.user.id)))
      await tx
        .update(recipes)
        .set({ starCount: sql`GREATEST(0, ${recipes.starCount} - 1)` })
        .where(eq(recipes.id, recipeId))
    } else {
      // Star
      await tx.insert(recipeStars).values({ recipeId, userId: session.user.id })
      await tx
        .update(recipes)
        .set({ starCount: sql`${recipes.starCount} + 1` })
        .where(eq(recipes.id, recipeId))
    }
  })

  return { starred }
})
