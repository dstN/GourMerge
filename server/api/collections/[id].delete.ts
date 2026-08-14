/**
 * DELETE /api/collections/:id — Delete a collection
 *
 * `collection_recipes` rows cascade automatically. Recipes themselves are untouched —
 * deleting a collection never deletes the recipes it referenced.
 */
import { eq } from 'drizzle-orm'
import { collections } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const id = Number(getRouterParam(event, 'id'))
  if (isNaN(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid collection ID' })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [collection] = await db
    .select({ ownerId: collections.ownerId })
    .from(collections)
    .where(eq(collections.id, id))
    .limit(1)

  if (!collection) throw createError({ statusCode: 404, statusMessage: 'Collection not found' })
  if (collection.ownerId !== session.user.id) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  await useRateLimit(`collection:delete:${session.user.id}`, { max: 10, windowSeconds: 600 })

  await db.delete(collections).where(eq(collections.id, id))

  return { success: true }
})
