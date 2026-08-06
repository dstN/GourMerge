/**
 * POST /auth/login — Authenticate an existing user
 *
 * Validates credentials, verifies password hash, sets session cookie.
 *
 * If the account has a CONFIRMED TOTP enrolment, no session is created here: a
 * short-lived signed cookie is issued instead and the response asks for a code via
 * POST /auth/login-2fa.
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { userTotp, users } from '~~/server/database/schema'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  // ── Rate limit: 5 attempts per minute per IP ──────────────
  const key = getRateLimitKey(event, 'login')
  await useRateLimit(key, { max: 5, windowSeconds: 60 })

  const body = await readBody(event)

  // ── Validate ────────────────────────────────────────────────
  const result = loginSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Invalid credentials format',
    })
  }

  const { email, password } = result.data
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // ── Find user ───────────────────────────────────────────────
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid email or password',
    })
  }

  // ── Verify password ─────────────────────────────────────────
  const valid = await verifyPassword(user.passwordHash, password)
  if (!valid) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid email or password',
    })
  }

  // ── Session rotation: invalidate any pre-existing session (prevents fixation) ──
  await clearUserSession(event)

  // ── Second factor, if this account opted in ─────────────────
  // Only a CONFIRMED enrolment gates login. An unconfirmed row means the user began
  // setup and never proved possession — treating that as enabled would lock them out
  // of their own account. 2FA is entirely opt-in: an account with no enrolment takes
  // exactly the path it always did.
  const [totp] = await db
    .select({ confirmedAt: userTotp.confirmedAt })
    .from(userTotp)
    .where(eq(userTotp.userId, user.id))
    .limit(1)

  if (totp?.confirmedAt) {
    // Deliberately NOT a session — see server/utils/pendingTotp.ts for why a
    // half-authenticated session would make the second factor decorative.
    // `last_login_at` is not stamped yet either: the login is not complete.
    await setPendingTotp(event, user.id)
    return { success: false, totpRequired: true }
  }

  // ── Set session + stamp the inactivity clock ────────────────
  await completeLogin(event, user)

  return { success: true }
})
