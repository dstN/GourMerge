/**
 * POST /api/auth/totp/disable — turn 2FA off.
 *
 * Requires the **password**, not a TOTP code. Two reasons: someone who has grabbed
 * an unlocked session should not be able to strip the second factor, and a user
 * whose phone is lost or broken must still be able to disable it (which a
 * code-gated endpoint would prevent — they would have to burn a recovery code just
 * to switch the feature off).
 *
 * Deleting the enrolment also deletes the recovery codes, so a previously printed
 * sheet cannot be replayed against a later re-enrolment.
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { userRecoveryCodes, userTotp, users } from '~~/server/database/schema'

const schema = z.object({ password: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  await useRateLimit(getRateLimitKey(event, 'totp-disable'), { max: 5, windowSeconds: 300 })

  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Password is required' })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const userId = session.user.id
  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1)
  if (!user) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  if (!(await verifyPassword(user.passwordHash, parsed.data.password))) {
    throw createError({ statusCode: 401, statusMessage: 'Incorrect password' })
  }

  await db.transaction(async (tx) => {
    await tx.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId))
    await tx.delete(userTotp).where(eq(userTotp.userId, userId))
  })

  logger.info('totp disabled', { userId })

  return { success: true }
})
