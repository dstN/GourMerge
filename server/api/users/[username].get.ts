/**
 * GET /api/users/:username — Public user profile
 *
 * Returns user info + their public recipes (+ private ones if viewing own profile).
 */
import { eq, and, desc } from 'drizzle-orm'
import { users, recipes, recipeStars } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')
  if (!username) {
    throw createError({ statusCode: 400, statusMessage: 'Username required' })
  }

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })
  const session = await getUserSession(event)

  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.username, username))
    .limit(1)

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  const isOwnProfile = session?.user?.id === user.id

  // Fetch recipes: all if own profile, public only otherwise
  const recipeRows = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      slug: recipes.slug,
      description: recipes.description,
      visibility: recipes.visibility,
      difficulty: recipes.difficulty,
      servings: recipes.servings,
      prepTimeMinutes: recipes.prepTimeMinutes,
      cookTimeMinutes: recipes.cookTimeMinutes,
      starCount: recipes.starCount,
      forkCount: recipes.forkCount,
      forkedFromRecipeId: recipes.forkedFromRecipeId,
      createdAt: recipes.createdAt,
    })
    .from(recipes)
    .where(
      isOwnProfile
        ? eq(recipes.ownerId, user.id)
        : and(eq(recipes.ownerId, user.id), eq(recipes.visibility, 'public'))
    )
    .orderBy(desc(recipes.createdAt))
    .limit(50)

  // Starred recipes (public only)
  const starredRows = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      slug: recipes.slug,
      difficulty: recipes.difficulty,
      starCount: recipes.starCount,
      ownerId: recipes.ownerId,
    })
    .from(recipeStars)
    .innerJoin(recipes, and(
      eq(recipeStars.recipeId, recipes.id),
      eq(recipes.visibility, 'public'),
    ))
    .where(eq(recipeStars.userId, user.id))
    .orderBy(desc(recipeStars.createdAt))
    .limit(20)

  return {
    user: {
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      createdAt: user.createdAt,
    },
    recipes: recipeRows,
    starredRecipes: starredRows,
    isOwnProfile,
  }
})
