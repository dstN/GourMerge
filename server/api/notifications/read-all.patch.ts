/**
 * PATCH /api/notifications/read-all — mark every unread notification read
 */
import { and, eq, isNull } from 'drizzle-orm'
import { notifications } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  await useRateLimit(`notification:read-all:${session.user.id}`, { max: 20, windowSeconds: 600 })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.recipientId, session.user.id), isNull(notifications.readAt)))

  return { success: true }
})
