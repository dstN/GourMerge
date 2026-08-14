/**
 * PATCH /api/collections/:id — Update collection metadata
 *
 * 404-then-403 ownership check, matching the existing (imperfect but established)
 * convention on `recipes/[id].patch.ts` rather than inventing a stricter standard here.
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { collections } from '~~/server/database/schema'

const updateCollectionSchema = z.object({
  title: z.string().min(2).max(300).optional(),
  description: z.string().max(5000).optional().nullable(),
  visibility: z.enum(['public', 'private']).optional(),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const id = Number(getRouterParam(event, 'id'))
  if (isNaN(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid collection ID' })

  const body = await readBody(event)
  const result = updateCollectionSchema.safeParse(body)
  if (!result.success) {
    throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: result.error.flatten().fieldErrors })
  }

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [collection] = await db
    .select({ ownerId: collections.ownerId })
    .from(collections)
    .where(eq(collections.id, id))
    .limit(1)

  if (!collection) throw createError({ statusCode: 404, statusMessage: 'Collection not found' })
  if (collection.ownerId !== session.user.id) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  await useRateLimit(`collection:update:${session.user.id}`, { max: 60, windowSeconds: 600 })

  await db.update(collections).set(result.data).where(eq(collections.id, id))

  return { success: true }
})
