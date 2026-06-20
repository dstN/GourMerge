/**
 * GET /api/recipes/starred — Recipes the current user has starred
 *
 * Authenticated. Returns card-shaped rows (most-recently-starred first).
 * Private recipes remain visible to the viewer only if they still have access
 * (own recipe, or it is public).
 */
import { eq, and, or, desc } from 'drizzle-orm'
import { recipes, users, recipeStars } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

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
    .from(recipeStars)
    .innerJoin(recipes, eq(recipeStars.recipeId, recipes.id))
    .innerJoin(users, eq(recipes.ownerId, users.id))
    .where(
      and(
        eq(recipeStars.userId, session.user.id),
        or(eq(recipes.visibility, 'public'), eq(recipes.ownerId, session.user.id))!
      )
    )
    .orderBy(desc(recipeStars.createdAt))

  return rows.map((r) => ({
    ...r,
    owner: { username: r.ownerUsername, displayName: r.ownerDisplayName, avatarUrl: r.ownerAvatarUrl },
  }))
})
