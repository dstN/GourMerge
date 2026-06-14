/**
 * GET /api/recipes/explore — Browse public recipes
 *
 * Query params:
 *   q        — full-text search on title + description
 *   difficulty — 'easy' | 'medium' | 'hard'
 *   tag      — tag name (case-insensitive)
 *   sort     — 'stars' (default) | 'newest' | 'forks'
 *   page     — 1-based page number (default 1)
 *   limit    — page size (default 20, max 50)
 */
import { eq, and, desc, like, or } from 'drizzle-orm'
import { recipes, users, recipeTags, tags } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = String(query.q || '').trim()
  const difficulty = query.difficulty as string | undefined
  const tagFilter = String(query.tag || '').trim().toLowerCase()
  const sort = String(query.sort || 'stars')
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20))
  const offset = (page - 1) * limit

  const db = useDrizzle()!

  const conditions = [eq(recipes.visibility, 'public')]

  if (q) {
    conditions.push(or(
      like(recipes.title, `%${q}%`),
      like(recipes.description, `%${q}%`),
    )!)
  }

  if (difficulty && ['easy', 'medium', 'hard'].includes(difficulty)) {
    conditions.push(eq(recipes.difficulty, difficulty as 'easy' | 'medium' | 'hard'))
  }

  // Tag filter: join recipe_tags + tags
  if (tagFilter) {
    const [tag] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(like(tags.name, tagFilter))
      .limit(1)

    if (!tag) {
      return { recipes: [], total: 0, page, limit }
    }

    // Get recipe IDs that have this tag, then filter
    const taggedRecipeIds = await db
      .select({ recipeId: recipeTags.recipeId })
      .from(recipeTags)
      .where(eq(recipeTags.tagId, tag.id))

    if (taggedRecipeIds.length === 0) {
      return { recipes: [], total: 0, page, limit }
    }

    // MariaDB doesn't have an inArray that plays nicely with large sets;
    // for v1 scale this is fine
    const ids = taggedRecipeIds.map((r) => r.recipeId)
    const { inArray } = await import('drizzle-orm')
    conditions.push(inArray(recipes.id, ids))
  }

  const whereClause = conditions.length === 1 ? conditions[0]! : and(...conditions)!

  const orderBy = sort === 'newest'
    ? desc(recipes.createdAt)
    : sort === 'forks'
      ? desc(recipes.forkCount)
      : desc(recipes.starCount)

  const rows = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      slug: recipes.slug,
      description: recipes.description,
      difficulty: recipes.difficulty,
      servings: recipes.servings,
      prepTimeMinutes: recipes.prepTimeMinutes,
      cookTimeMinutes: recipes.cookTimeMinutes,
      visibility: recipes.visibility,
      starCount: recipes.starCount,
      forkCount: recipes.forkCount,
      forkedFromRecipeId: recipes.forkedFromRecipeId,
      createdAt: recipes.createdAt,
      ownerUsername: users.username,
      ownerDisplayName: users.displayName,
      ownerAvatarUrl: users.avatarUrl,
    })
    .from(recipes)
    .innerJoin(users, eq(recipes.ownerId, users.id))
    .where(whereClause)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset)

  return { recipes: rows, page, limit }
})
