/**
 * POST /auth/login — Authenticate an existing user
 *
 * Validates credentials, verifies password hash, sets session cookie.
 *
 * If the account has a CONFIRMED TOTP enrolment, no session is created here: a
 * short-lived signed cookie is issued instead and the response asks for a code via
 * POST /auth/login-2fa.
 *
 * ## Email or username
 *
 * The identifier is matched against BOTH columns, and the two can never collide:
 * `users.username` is validated at registration as `[a-zA-Z0-9_-]+`, so it cannot
 * contain an `@`, and an email address must. A value therefore addresses exactly one
 * of the two columns, both of which are unique — there is no case where the OR can
 * return the wrong row, and none where it can return two.
 */
import { z } from 'zod'
import { eq, or } from 'drizzle-orm'
import { userTotp, users } from '~~/server/database/schema'

const loginSchema = z
  .object({
    /** Email address or username. */
    identifier: z.string().trim().min(1).max(255).optional(),
    /**
     * Legacy name for the same field. Kept so a browser still running the previously
     * cached bundle can sign in during the minutes after a deploy — otherwise the
     * rollout itself locks people out of the login form.
     */
    email: z.string().trim().min(1).max(255).optional(),
    password: z.string().min(1),
  })
  .refine((data) => Boolean(data.identifier ?? data.email), {
    message: 'An email address or username is required',
    path: ['identifier'],
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

  const { password } = result.data
  const identifier = result.data.identifier ?? result.data.email!
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // ── Find user ───────────────────────────────────────────────
  const [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.email, identifier), eq(users.username, identifier)))
    .limit(1)

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid credentials',
    })
  }

  // ── Verify password ─────────────────────────────────────────
  const valid = await verifyPassword(user.passwordHash, password)
  if (!valid) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid credentials',
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
