/**
 * DELETE /api/auth/passkeys/:id — remove one passkey.
 *
 * Scoped to the session's own rows, so a guessed id cannot delete someone else's key.
 * A missing row returns 404 rather than a distinct "not yours", which keeps the
 * endpoint from confirming that an id exists.
 *
 * Deliberately does **not** refuse to remove the last passkey. A password always
 * remains on the account (registration requires one), so deleting every key cannot
 * lock anyone out — unlike disabling TOTP, this needs no escape hatch.
 */
import { and, eq } from 'drizzle-orm'
import { userPasskeys } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  await useRateLimit(getRateLimitKey(event, 'passkey-delete'), { max: 20, windowSeconds: 300 })

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid passkey id' })
  }

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [row] = await db
    .select({ id: userPasskeys.id })
    .from(userPasskeys)
    .where(and(eq(userPasskeys.id, id), eq(userPasskeys.userId, session.user.id)))
    .limit(1)

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Passkey not found' })

  await db.delete(userPasskeys).where(eq(userPasskeys.id, row.id))
  logger.info('passkey removed', { userId: session.user.id })

  return { success: true }
})
