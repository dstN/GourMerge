/**
 * GET /api/recipes/explore — Browse public recipes
 *
 * Query params:
 *   q           — full-text search on title + description
 *   difficulty  — 'easy' | 'medium' | 'hard'
 *   dietaryType — 'vegan' | 'vegetarian' | 'pescatarian' | 'omnivore'
 *   tag         — tag name (case-insensitive)
 *   sort        — 'stars' (default) | 'newest' | 'forks'
 *   page        — 1-based page number (default 1)
 *   limit       — page size (default 20, max 50)
 */
import { eq, and, desc, like, or, inArray, sql } from 'drizzle-orm'
import { recipes, users, recipeTags, tags } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = String(query.q || '').trim()
  const difficulty = query.difficulty as string | undefined
  const dietaryTypeFilter = String(query.dietaryType || '')
    .trim()
    .toLowerCase()
  const tagFilter = String(query.tag || '')
    .trim()
    .toLowerCase()
  const sort = String(query.sort || 'stars')
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20))
  const offset = (page - 1) * limit

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const conditions = [eq(recipes.visibility, 'public')]

  // ── Hide system tour recipe ─────────────────────────────────────
  // The system user's recipe exists solely as a fork target during onboarding.
  // Guests never see it (they can't take the tour). Logged-in users who have
  // finished the tour don't see it either. Only users mid-tour see it.
  const session = await getUserSession(event)
  const viewerUserId = session?.user?.id as number | undefined
  let showSystemRecipe = false
  if (viewerUserId) {
    const [viewer] = await db
      .select({ hasFinishedTour: users.hasFinishedTour })
      .from(users)
      .where(eq(users.id, viewerUserId))
      .limit(1)
    showSystemRecipe = viewer ? !viewer.hasFinishedTour : false
  }
  if (!showSystemRecipe) {
    // Exclude recipes owned by the `system` user.
    // Sub-select: find the system user's id once.
    conditions.push(sql`${recipes.ownerId} NOT IN (SELECT id FROM users WHERE username = 'system')`)
  }

  if (q) {
    // FULLTEXT (ft_recipes_title_description, migration 0006) for real words;
    // fall back to LIKE for short terms below InnoDB's min token size (default 3).
    if (q.length >= 3) {
      conditions.push(sql`MATCH(${recipes.title}, ${recipes.description}) AGAINST (${q} IN NATURAL LANGUAGE MODE)`)
    } else {
      // Escaped: a `%`/`_` in a 1-2 character query should not turn into a wildcard scan.
      const qLike = `%${escapeLikePattern(q)}%`
      conditions.push(or(like(recipes.title, qLike), like(recipes.description, qLike))!)
    }
  }

  if (difficulty && ['easy', 'medium', 'hard'].includes(difficulty)) {
    conditions.push(eq(recipes.difficulty, difficulty as 'easy' | 'medium' | 'hard'))
  }

  if (dietaryTypeFilter && ['vegan', 'vegetarian', 'pescatarian', 'omnivore'].includes(dietaryTypeFilter)) {
    conditions.push(eq(recipes.dietaryType, dietaryTypeFilter))
  }

  // Tag filter: join recipe_tags + tags
  if (tagFilter) {
    // No wildcards are meant to be in play here — `like()` only for case-insensitive
    // matching via collation — so an unescaped `%`/`_` in the tag name would turn an
    // exact-ish lookup into "any tag" or "any 5-character tag".
    const [tag] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(like(tags.name, escapeLikePattern(tagFilter)))
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

    // An IN (…) list does not scale to very large sets; fine at v1 scale.
    const ids = taggedRecipeIds.map((r) => r.recipeId)
    conditions.push(inArray(recipes.id, ids))
  }

  const whereClause = conditions.length === 1 ? conditions[0]! : and(...conditions)!

  // Total matching rows (same filters) → drives real pagination on the client.
  const [countRow] = await db
    .select({ total: sql<number>`count(*)` })
    .from(recipes)
    .innerJoin(users, eq(recipes.ownerId, users.id))
    .where(whereClause)
  const total = Number(countRow?.total ?? 0)

  const orderBy =
    sort === 'newest' ? desc(recipes.createdAt) : sort === 'forks' ? desc(recipes.forkCount) : desc(recipes.starCount)

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

  // Fetch tags for all returned recipes
  const recipeIds = rows.map((r) => r.id)
  const tagMap = new Map<number, string[]>()

  if (recipeIds.length > 0) {
    const tagRows = await db
      .select({ recipeId: recipeTags.recipeId, tagName: tags.name })
      .from(recipeTags)
      .innerJoin(tags, eq(recipeTags.tagId, tags.id))
      .where(inArray(recipeTags.recipeId, recipeIds))

    for (const row of tagRows) {
      const existing = tagMap.get(row.recipeId) ?? []
      existing.push(row.tagName)
      tagMap.set(row.recipeId, existing)
    }
  }

  const recipesWithTags = rows.map((r) => ({
    ...r,
    tags: tagMap.get(r.id) ?? [],
  }))

  return { recipes: recipesWithTags, total, page, limit }
})
