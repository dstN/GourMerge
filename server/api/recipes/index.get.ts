/**
 * GET /api/recipes — List recipes
 *
 * For authenticated users: returns their own recipes.
 * With ?public=true: returns public recipes (for explore page).
 */
import { eq, desc, and } from 'drizzle-orm'
import { recipes, users, recipeBranches } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const db = useDrizzle()

  // ── Public listing ──────────────────────────────────────────
  if (query.public === 'true') {
    const publicRecipes = await db
      .select({
        id: recipes.id,
        title: recipes.title,
        slug: recipes.slug,
        description: recipes.description,
        visibility: recipes.visibility,
        servings: recipes.servings,
        prepTimeMinutes: recipes.prepTimeMinutes,
        cookTimeMinutes: recipes.cookTimeMinutes,
        difficulty: recipes.difficulty,
        starCount: recipes.starCount,
        forkCount: recipes.forkCount,
        createdAt: recipes.createdAt,
        owner: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(recipes)
      .innerJoin(users, eq(recipes.ownerId, users.id))
      .where(eq(recipes.visibility, 'public'))
      .orderBy(desc(recipes.createdAt))
      .limit(50)

    return publicRecipes
  }

  // ── Authenticated user's recipes ────────────────────────────
  const session = await requireUserSession(event)
  const userId = session.user.id

  const userRecipes = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      slug: recipes.slug,
      description: recipes.description,
      visibility: recipes.visibility,
      servings: recipes.servings,
      prepTimeMinutes: recipes.prepTimeMinutes,
      cookTimeMinutes: recipes.cookTimeMinutes,
      difficulty: recipes.difficulty,
      starCount: recipes.starCount,
      forkCount: recipes.forkCount,
      createdAt: recipes.createdAt,
      updatedAt: recipes.updatedAt,
      owner: {
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(recipes)
    .innerJoin(users, eq(recipes.ownerId, users.id))
    .where(eq(recipes.ownerId, userId))
    .orderBy(desc(recipes.updatedAt))

  return userRecipes
})
