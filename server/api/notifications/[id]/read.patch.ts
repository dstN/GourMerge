/**
 * PATCH /api/notifications/:id/read — mark one notification read
 *
 * Idempotent, scoped to the caller's own recipient_id — a notification has no "exists but
 * private" state the way a recipe does, so there is no 404-vs-403 nuance here: it is
 * simply yours or it isn't.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { notifications } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const id = Number(getRouterParam(event, 'id'))
  if (isNaN(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid notification ID' })

  await useRateLimit(`notification:read:${session.user.id}`, { max: 120, windowSeconds: 600 })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [row] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.recipientId, session.user.id)))
    .limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Notification not found' })

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.recipientId, session.user.id), isNull(notifications.readAt)))

  return { success: true }
})
