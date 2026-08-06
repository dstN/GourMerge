/**
 * POST /api/auth/totp/confirm — finish enrolment by proving possession.
 *
 * Only after a valid code does the row become `confirmed` and start gating login.
 * Returns the recovery codes **once** — they are stored bcrypt-hashed, so this
 * response is the only time they exist in readable form. Without them a lost phone
 * is an unrecoverable lockout, which is the most common way a 2FA rollout turns
 * into support load.
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { userRecoveryCodes, userTotp } from '~~/server/database/schema'

const schema = z.object({ token: z.string().min(6).max(10) })

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  // 6 digits is brute-forceable without a limit — 1e6 space, and an attacker only
  // needs the window to overlap. This is the single most important control here.
  await useRateLimit(getRateLimitKey(event, 'totp-confirm'), { max: 8, windowSeconds: 300 })

  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid code format' })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const userId = session.user.id
  const [row] = await db.select().from(userTotp).where(eq(userTotp.userId, userId)).limit(1)
  if (!row) throw createError({ statusCode: 409, statusMessage: 'Start two-factor setup first.' })
  if (row.confirmedAt) {
    throw createError({ statusCode: 409, statusMessage: 'Two-factor authentication is already enabled.' })
  }

  const { valid, counter } = verifyTotp(decryptSecret(row.secretEncrypted), parsed.data.token, row.lastUsedCounter)
  if (!valid) throw createError({ statusCode: 401, statusMessage: 'That code is not valid. Please try again.' })

  const codes = generateRecoveryCodes()

  await db.transaction(async (tx) => {
    await tx
      .update(userTotp)
      .set({ confirmedAt: new Date(), lastUsedCounter: counter ?? null })
      .where(eq(userTotp.userId, userId))

    // Replace rather than append: re-enrolling must invalidate the old codes, or a
    // leaked sheet from a previous enrolment would stay live forever.
    await tx.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId))
    for (const code of codes) {
      await tx.insert(userRecoveryCodes).values({ userId, codeHash: await hashPassword(code) })
    }
  })

  logger.info('totp enabled', { userId })

  return { success: true, recoveryCodes: codes }
})
