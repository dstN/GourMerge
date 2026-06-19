import { randomBytes, createHash } from 'node:crypto'
import { eq, and, isNull } from 'drizzle-orm'
import { emailVerificationTokens, users } from '~~/server/database/schema'
import { useRateLimit, getRateLimitKey } from '~~/server/utils/rateLimit'
import { sendMail } from '~~/server/utils/mailer'

export default defineEventHandler(async (event) => {
  await useRateLimit(getRateLimitKey(event, 'auth:send-verification'), { max: 3, windowSeconds: 3600 })

  const { user } = await requireUserSession(event)
  if (!user?.id) throw createError({ statusCode: 401 })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })
  const [dbUser] = await db
    .select({ id: users.id, email: users.email, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)

  if (!dbUser) throw createError({ statusCode: 401 })
  if (dbUser.emailVerifiedAt) {
    return { alreadyVerified: true }
  }

  // Invalidate any existing unused tokens for this user.
  await db
    .delete(emailVerificationTokens)
    .where(and(eq(emailVerificationTokens.userId, dbUser.id), isNull(emailVerificationTokens.usedAt)))

  // Generate a CSPRNG token — NOT UUIDv7 (timestamp prefix weakens unguessability).
  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24) // 24h

  await db.insert(emailVerificationTokens).values({ userId: dbUser.id, tokenHash, expiresAt })

  const appUrl = useRuntimeConfig().appUrl.replace(/\/$/, '')
  const verifyUrl = `${appUrl}/auth/verify?token=${rawToken}`

  await sendMail({
    to: dbUser.email,
    subject: 'Verify your GourMerge email address',
    text: `Click the link to verify your email:\n\n${verifyUrl}\n\nLink expires in 24 hours.`,
    html: `<p>Click the link below to verify your GourMerge account:</p>
<p><a href="${verifyUrl}">${verifyUrl}</a></p>
<p>This link expires in 24 hours. If you didn't request this, you can ignore it.</p>`,
  })

  return { sent: true }
})
