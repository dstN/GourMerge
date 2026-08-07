/**
 * GET /auth/confirm-email-change — complete a requested email address change
 *
 * Mirrors `/auth/verify`: an unauthenticated, token-based GET, because the link is
 * clicked from an email client that carries no session. Confirming this link is proof
 * of ownership of `newEmail` — the same proof `email_verified_at` exists to record — so
 * a successful confirm sets the email column AND the verification timestamp together.
 * That keeps `REQUIRE_EMAIL_VERIFICATION` consistent: an account cannot switch away from
 * the address that was actually verified and land back in an unverified state by the
 * column alone, because completing this flow re-verifies the new one in the same step.
 */
import { createHash } from 'node:crypto'
import { eq, and, ne } from 'drizzle-orm'
import { emailChangeTokens, users } from '~~/server/database/schema'
import { useRateLimit, getRateLimitKey } from '~~/server/utils/rateLimit'

export default defineEventHandler(async (event) => {
  // Unauthenticated endpoint — rate-limit by IP against brute-forcing the token, same as
  // /auth/verify.
  await useRateLimit(getRateLimitKey(event, 'auth:confirm-email-change'), { max: 10, windowSeconds: 60 })

  const { token } = getQuery(event) as { token?: string }
  if (!token || typeof token !== 'string' || token.length < 32) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid confirmation token.' })
  }

  const tokenHash = createHash('sha256').update(token).digest('hex')
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [row] = await db
    .select({
      id: emailChangeTokens.id,
      userId: emailChangeTokens.userId,
      newEmail: emailChangeTokens.newEmail,
      expiresAt: emailChangeTokens.expiresAt,
      usedAt: emailChangeTokens.usedAt,
    })
    .from(emailChangeTokens)
    .where(eq(emailChangeTokens.tokenHash, tokenHash))
    .limit(1)

  if (!row) throw createError({ statusCode: 400, statusMessage: 'Invalid or expired token.' })
  if (row.usedAt) throw createError({ statusCode: 400, statusMessage: 'Token already used.' })
  if (new Date(row.expiresAt) < new Date()) throw createError({ statusCode: 400, statusMessage: 'Token expired.' })

  // Re-check the address is still free. Time has passed since the request — another
  // account could since have taken it (including via its own, later, still-pending
  // change) — and the unique constraint on `users.email` would otherwise turn this into
  // a raw SQL error instead of a clean one.
  const [claimed] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, row.newEmail), ne(users.id, row.userId)))
    .limit(1)
  if (claimed) {
    throw createError({ statusCode: 409, statusMessage: 'That email address was claimed in the meantime.' })
  }

  await db.transaction(async (tx) => {
    await tx.update(emailChangeTokens).set({ usedAt: new Date() }).where(eq(emailChangeTokens.id, row.id))
    await tx.update(users).set({ email: row.newEmail, emailVerifiedAt: new Date() }).where(eq(users.id, row.userId))
  })

  // Same reasoning as /auth/verify: refresh the session in place if this link is opened
  // in the browser that is already signed in as that user, so neither the stale email nor
  // the stale "unverified" banner lingers until the next login. Guarded on the user id for
  // the same reason — a shared machine may be signed in as someone else entirely.
  const session = await getUserSession(event)
  if (session?.user?.id === row.userId) {
    await setUserSession(event, {
      ...session,
      user: { ...session.user, email: row.newEmail, emailVerified: true },
    })
  }

  return sendRedirect(event, '/auth/email-changed', 302)
})
