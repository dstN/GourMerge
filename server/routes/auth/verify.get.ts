import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { emailVerificationTokens, users } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  // Rate-limit by IP to prevent token brute-forcing (unauthenticated endpoint).
  await useRateLimit(getRateLimitKey(event, 'auth:verify'), { max: 10, windowSeconds: 60 })

  const { token } = getQuery(event) as { token?: string }

  if (!token || typeof token !== 'string' || token.length < 32) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid verification token.' })
  }

  const tokenHash = createHash('sha256').update(token).digest('hex')
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [row] = await db
    .select({
      id: emailVerificationTokens.id,
      userId: emailVerificationTokens.userId,
      expiresAt: emailVerificationTokens.expiresAt,
      usedAt: emailVerificationTokens.usedAt,
    })
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.tokenHash, tokenHash))
    .limit(1)

  if (!row) throw createError({ statusCode: 400, statusMessage: 'Invalid or expired token.' })
  if (row.usedAt) throw createError({ statusCode: 400, statusMessage: 'Token already used.' })
  if (new Date(row.expiresAt) < new Date()) throw createError({ statusCode: 400, statusMessage: 'Token expired.' })

  // Mark token as used + set emailVerifiedAt on user (same transaction for safety).
  await db.transaction(async (tx) => {
    await tx.update(emailVerificationTokens).set({ usedAt: new Date() }).where(eq(emailVerificationTokens.id, row.id))

    await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, row.userId))
  })

  /**
   * If the link was opened in the browser that is already signed in as this user,
   * refresh the cached flag so the "verify your email" banner goes away immediately.
   * Without this the DB says verified and the session cookie still says otherwise
   * until the next login — the banner would keep nagging someone who just complied.
   *
   * Guarded on the id: the link may well be opened while signed in as somebody else
   * (a shared machine), and marking *their* session verified would be a lie.
   */
  const session = await getUserSession(event)
  if (session?.user?.id === row.userId) {
    // Spread the whole session: `setUserSession` replaces rather than deep-merges, so
    // passing only `user` would drop `loggedInAt` and the rest of the session shape.
    await setUserSession(event, { ...session, user: { ...session.user, emailVerified: true } })
  }

  // Redirect to success page.
  return sendRedirect(event, '/auth/verified', 302)
})
