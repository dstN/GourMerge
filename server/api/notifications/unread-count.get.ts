/**
 * GET /api/notifications/unread-count — the header bell's poll target
 *
 * Kept as one lightweight indexed query, not the full list — this is requested on every
 * page by every signed-in visitor, the same hot-path caution the avatar endpoint had to
 * take. Joined to `recipes` for the same visibility suppression the rest of the
 * notification surface applies: an unread mention/reply on a recipe that has since gone
 * private (and isn't the recipient's own) must not count.
 */
import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { notifications, recipes } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(notifications)
    .innerJoin(recipes, eq(recipes.id, notifications.recipeId))
    .where(
      and(
        eq(notifications.recipientId, session.user.id),
        isNull(notifications.readAt),
        or(eq(recipes.visibility, 'public'), eq(recipes.ownerId, session.user.id))
      )
    )

  return { count: Number(row?.n ?? 0) }
})
