/**
 * GET /api/auth/totp — the viewer's own 2FA status.
 *
 * Deliberately returns no secret and no code — only whether 2FA is on, and how many
 * recovery codes are still unused, so `/settings` can prompt a regeneration before
 * the user runs out.
 */
import { and, eq, isNull, sql } from 'drizzle-orm'
import { userRecoveryCodes, userTotp } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const userId = session.user.id

  const [row] = await db
    .select({ confirmedAt: userTotp.confirmedAt })
    .from(userTotp)
    .where(eq(userTotp.userId, userId))
    .limit(1)

  const [codes] = await db
    .select({ remaining: sql<number>`COUNT(*)` })
    .from(userRecoveryCodes)
    .where(and(eq(userRecoveryCodes.userId, userId), isNull(userRecoveryCodes.usedAt)))

  return {
    enabled: !!row?.confirmedAt,
    enabledAt: row?.confirmedAt ?? null,
    recoveryCodesRemaining: Number(codes?.remaining ?? 0),
  }
})
