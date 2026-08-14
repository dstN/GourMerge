/**
 * GET /api/collections/by-slug/:username/:slug — Resolve a collection by owner + slug
 *
 * The one query that must never be "read-time-check-only" or "add-time-check-only": every
 * joined recipe is re-filtered here to `visibility='public' OR ownerId=viewer`, dropping
 * any recipe that has gone private since it was added (or belongs to someone else and was
 * always private to this viewer). The add-time half of the check lives in
 * `collections/[id]/recipes/index.post.ts`.
 *
 * Item count is a live `COUNT(*)` over the same filtered join, never a stored total — see
 * `schema.ts`'s comment on `collections` for why a denormalized count would leak.
 */
import { eq, and, or, desc, inArray } from 'drizzle-orm'
import { collections, collectionRecipes, recipes, users, recipeTags, tags } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')
  const slug = getRouterParam(event, 'slug')
  if (!username || !slug) throw createError({ statusCode: 400, statusMessage: 'Username and slug are required' })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [owner] = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.username, username))
    .limit(1)
  if (!owner) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  const [collection] = await db
    .select({
      id: collections.id,
      title: collections.title,
      slug: collections.slug,
      description: collections.description,
      visibility: collections.visibility,
      createdAt: collections.createdAt,
    })
    .from(collections)
    .where(and(eq(collections.ownerId, owner.id), eq(collections.slug, slug)))
    .limit(1)
  if (!collection) throw createError({ statusCode: 404, statusMessage: 'Collection not found' })

  const session = await getUserSession(event)
  const viewerId = session?.user?.id ?? null
  if (collection.visibility === 'private' && owner.id !== viewerId) {
    throw createError({ statusCode: 404, statusMessage: 'Collection not found' })
  }

  const visibilityFilter = viewerId
    ? or(eq(recipes.visibility, 'public'), eq(recipes.ownerId, viewerId))
    : eq(recipes.visibility, 'public')

  const recipeRows = await db
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
      addedAt: collectionRecipes.addedAt,
      ownerUsername: users.username,
      ownerDisplayName: users.displayName,
      ownerAvatarUrl: users.avatarUrl,
    })
    .from(collectionRecipes)
    .innerJoin(recipes, eq(collectionRecipes.recipeId, recipes.id))
    .innerJoin(users, eq(recipes.ownerId, users.id))
    .where(and(eq(collectionRecipes.collectionId, collection.id), visibilityFilter))
    .orderBy(desc(collectionRecipes.addedAt))

  const recipeIds = recipeRows.map((r) => r.id)
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

  return {
    collection: {
      ...collection,
      owner: { username: owner.username, displayName: owner.displayName, avatarUrl: owner.avatarUrl },
      isOwner: viewerId === owner.id,
      recipeCount: recipeRows.length,
    },
    recipes: recipeRows.map((r) => ({
      ...r,
      tags: tagMap.get(r.id) ?? [],
      owner: { username: r.ownerUsername, displayName: r.ownerDisplayName, avatarUrl: r.ownerAvatarUrl },
    })),
  }
})
