/**
 * GET /api/recipes/:id/forks — List recipes forked from this one
 *
 * Returns public forks to everyone; a viewer additionally sees their own
 * private forks. Card-shaped rows for RecipeCard.
 */
import { eq, and, or, desc } from 'drizzle-orm'
import { recipes, users } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const recipeId = Number(getRouterParam(event, 'id'))
  if (isNaN(recipeId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid recipe ID' })
  }

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const session = await getUserSession(event)
  const viewerId = session?.user?.id ?? null

  // Public forks are visible to all; private forks only to their owner.
  const visibility = viewerId
    ? or(eq(recipes.visibility, 'public'), eq(recipes.ownerId, viewerId))!
    : eq(recipes.visibility, 'public')

  const rows = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      slug: recipes.slug,
      description: recipes.description,
      difficulty: recipes.difficulty,
      dietaryType: recipes.dietaryType,
      servings: recipes.servings,
      prepTimeMinutes: recipes.prepTimeMinutes,
      cookTimeMinutes: recipes.cookTimeMinutes,
      visibility: recipes.visibility,
      starCount: recipes.starCount,
      forkCount: recipes.forkCount,
      createdAt: recipes.createdAt,
      ownerUsername: users.username,
      ownerDisplayName: users.displayName,
      ownerAvatarUrl: users.avatarUrl,
    })
    .from(recipes)
    .innerJoin(users, eq(recipes.ownerId, users.id))
    .where(and(eq(recipes.forkedFromRecipeId, recipeId), visibility))
    .orderBy(desc(recipes.starCount), desc(recipes.createdAt))

  const forks = rows.map((r) => ({
    ...r,
    owner: { username: r.ownerUsername, displayName: r.ownerDisplayName, avatarUrl: r.ownerAvatarUrl },
  }))

  return { forks, total: forks.length }
})
