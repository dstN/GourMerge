/**
 * GET /api/recipes — List recipes
 *
 * For authenticated users: returns their own recipes.
 * With ?public=true: returns public recipes (for explore page).
 */
import { eq, desc, inArray } from 'drizzle-orm'
import { recipes, users, recipeTags, tags } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

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
        dietaryType: recipes.dietaryType,
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

    return withTags(db, publicRecipes)
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
      dietaryType: recipes.dietaryType,
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

  return withTags(db, userRecipes)
})

async function withTags<T extends { id: number }>(db: ReturnType<typeof useDrizzle>, rows: T[]) {
  if (!rows.length) return rows.map((r) => ({ ...r, tags: [] as string[] }))
  const ids = rows.map((r) => r.id)
  const tagRows = await db
    .select({ recipeId: recipeTags.recipeId, name: tags.name })
    .from(recipeTags)
    .innerJoin(tags, eq(recipeTags.tagId, tags.id))
    .where(inArray(recipeTags.recipeId, ids))
  const map = new Map<number, string[]>()
  for (const row of tagRows) {
    if (!map.has(row.recipeId)) map.set(row.recipeId, [])
    map.get(row.recipeId)!.push(row.name)
  }
  return rows.map((r) => ({ ...r, tags: map.get(r.id) ?? ([] as string[]) }))
}
