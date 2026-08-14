/**
 * DELETE /api/collections/:id/recipes/:recipeId — Remove a recipe from a collection
 *
 * Owner-only. No visibility re-check needed to remove — a stale/now-invisible entry is
 * exactly the case this endpoint should still be able to clear, but the owner can only
 * ever ask for a recipe id they can already see (or once could), since the picker UI is
 * always built from a collection's own filtered read.
 */
import { eq, and } from 'drizzle-orm'
import { collections, collectionRecipes } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const collectionId = Number(getRouterParam(event, 'id'))
  const recipeId = Number(getRouterParam(event, 'recipeId'))
  if (isNaN(collectionId) || isNaN(recipeId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [collection] = await db
    .select({ ownerId: collections.ownerId })
    .from(collections)
    .where(eq(collections.id, collectionId))
    .limit(1)

  if (!collection) throw createError({ statusCode: 404, statusMessage: 'Collection not found' })
  if (collection.ownerId !== session.user.id) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  await useRateLimit(`collection:recipe-toggle:${session.user.id}`, { max: 60, windowSeconds: 600 })

  await db
    .delete(collectionRecipes)
    .where(and(eq(collectionRecipes.collectionId, collectionId), eq(collectionRecipes.recipeId, recipeId)))

  return { success: true }
})
