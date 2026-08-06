/**
 * POST /auth/login-2fa — complete a login by supplying the second factor.
 *
 * Accepts either a 6-digit TOTP code or one of the single-use recovery codes. The
 * pending state comes from the signed cookie set by `/auth/login`, never from a
 * session — so this endpoint cannot be used to elevate an arbitrary visitor, and it
 * cannot be skipped by calling protected endpoints directly.
 */
import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import { userRecoveryCodes, userTotp, users } from '~~/server/database/schema'

const schema = z.object({
  /** A TOTP code (6 digits) or a recovery code (`XXXXX-XXXXX`). */
  code: z.string().min(6).max(20),
})

export default defineEventHandler(async (event) => {
  // The tightest limit in the app. Six digits is a 1e6 space and an attacker who
  // already has the password only needs to hit the live window — without this the
  // second factor is a speed bump.
  await useRateLimit(getRateLimitKey(event, 'login-2fa'), { max: 8, windowSeconds: 300 })

  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid code format' })

  const userId = await readPendingTotp(event)
  if (!userId) {
    // Expired or absent — the user has to start from the password again.
    throw createError({ statusCode: 401, statusMessage: 'Your sign-in attempt expired. Please start again.' })
  }

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  const [totp] = await db.select().from(userTotp).where(eq(userTotp.userId, userId)).limit(1)
  if (!user || !totp?.confirmedAt) {
    clearPendingTotp(event)
    throw createError({ statusCode: 401, statusMessage: 'Your sign-in attempt expired. Please start again.' })
  }

  const raw = parsed.data.code.trim()
  let accepted = false
  let usedRecoveryCode = false

  if (/^\d{6}$/.test(raw.replace(/\s+/g, ''))) {
    const { valid, counter } = verifyTotp(decryptSecret(totp.secretEncrypted), raw, totp.lastUsedCounter)
    if (valid) {
      accepted = true
      // Persist the accepted step so the same code cannot be replayed inside its
      // own 30-second window.
      await db
        .update(userTotp)
        .set({ lastUsedCounter: counter ?? null })
        .where(eq(userTotp.userId, userId))
    }
  } else {
    // Recovery code. Hashes are bcrypt, so they must be compared one at a time
    // against the unused rows — there is no way to look one up by value.
    const candidate = normalizeRecoveryCode(raw)
    const rows = await db
      .select()
      .from(userRecoveryCodes)
      .where(and(eq(userRecoveryCodes.userId, userId), isNull(userRecoveryCodes.usedAt)))

    for (const row of rows) {
      if (await verifyPassword(row.codeHash, candidate)) {
        // Mark used before issuing the session: single-use has to hold even if the
        // rest of this request fails.
        await db.update(userRecoveryCodes).set({ usedAt: new Date() }).where(eq(userRecoveryCodes.id, row.id))
        accepted = true
        usedRecoveryCode = true
        break
      }
    }
  }

  if (!accepted) {
    throw createError({ statusCode: 401, statusMessage: 'That code is not valid.' })
  }

  clearPendingTotp(event)
  await completeLogin(event, user)

  if (usedRecoveryCode) {
    logger.warn('login used a recovery code', { userId })
  }

  return { success: true, usedRecoveryCode }
})
