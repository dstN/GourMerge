import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { emailVerificationTokens, users } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const { token } = getQuery(event) as { token?: string }

  if (!token || typeof token !== 'string' || token.length < 32) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid verification token.' })
  }

  const tokenHash = createHash('sha256').update(token).digest('hex')
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [row] = await db
    .select({ id: emailVerificationTokens.id, userId: emailVerificationTokens.userId, expiresAt: emailVerificationTokens.expiresAt, usedAt: emailVerificationTokens.usedAt })
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.tokenHash, tokenHash))
    .limit(1)

  if (!row) throw createError({ statusCode: 400, statusMessage: 'Invalid or expired token.' })
  if (row.usedAt) throw createError({ statusCode: 400, statusMessage: 'Token already used.' })
  if (new Date(row.expiresAt) < new Date()) throw createError({ statusCode: 400, statusMessage: 'Token expired.' })

  // Mark token as used + set emailVerifiedAt on user (same transaction for safety).
  await db.transaction(async (tx) => {
    await tx.update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(emailVerificationTokens.id, row.id))

    await tx.update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, row.userId))
  })

  // Redirect to success page.
  return sendRedirect(event, '/auth/verified', 302)
})
