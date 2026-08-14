/**
 * GET /api/collections/mine?recipeId= — The caller's own collections
 *
 * Powers the "save to collection" modal. When `recipeId` is given, each row carries
 * `containsRecipe` via a single correlated EXISTS — avoids an N+1 round trip per
 * collection to check membership from the client.
 */
import { eq, desc, sql } from 'drizzle-orm'
import { collections, collectionRecipes } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const query = getQuery(event)
  const recipeId = Number(query.recipeId) > 0 ? Number(query.recipeId) : null

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const rows = await db
    .select({
      id: collections.id,
      title: collections.title,
      slug: collections.slug,
      visibility: collections.visibility,
      containsRecipe: recipeId
        ? sql<number>`EXISTS(SELECT 1 FROM ${collectionRecipes} WHERE ${collectionRecipes.collectionId} = ${collections.id} AND ${collectionRecipes.recipeId} = ${recipeId})`
        : sql<number>`0`,
    })
    .from(collections)
    .where(eq(collections.ownerId, session.user.id))
    .orderBy(desc(collections.updatedAt))
    .limit(100)

  return rows.map((r) => ({ ...r, containsRecipe: !!r.containsRecipe }))
})
