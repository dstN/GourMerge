import { randomBytes, createHash } from 'node:crypto'
import { eq, and, isNull } from 'drizzle-orm'
import { passwordResetTokens, users } from '~~/server/database/schema'
import { useRateLimit, getRateLimitKey } from '~~/server/utils/rateLimit'
import { sendMail } from '~~/server/utils/mailer'
import { z } from 'zod'

const bodySchema = z.object({ email: z.string().email() })

export default defineEventHandler(async (event) => {
  await useRateLimit(getRateLimitKey(event, 'auth:forgot-password'), { max: 3, windowSeconds: 3600 })

  const body = await readBody(event)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid email.' })

  const db = useDrizzle()
  if (!db) return { sent: true } // fail open — don't reveal DB state

  // Always return success to prevent user enumeration.
  const [dbUser] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1)

  if (!dbUser) return { sent: true } // silent: don't reveal if email exists

  // Invalidate existing tokens.
  await db
    .delete(passwordResetTokens)
    .where(and(eq(passwordResetTokens.userId, dbUser.id), isNull(passwordResetTokens.usedAt)))

  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 2) // 2h

  await db.insert(passwordResetTokens).values({ userId: dbUser.id, tokenHash, expiresAt })

  const appUrl = useRuntimeConfig().appUrl.replace(/\/$/, '')
  const resetUrl = `${appUrl}/auth/reset-password?token=${rawToken}`

  await sendMail({
    to: dbUser.email,
    subject: 'Reset your GourMerge password',
    text: `Click the link to reset your password:\n\n${resetUrl}\n\nLink expires in 2 hours.`,
    html: `<p>Someone requested a password reset for your GourMerge account.</p>
<p><a href="${resetUrl}">Reset your password</a></p>
<p>This link expires in 2 hours. If you didn't request this, ignore this email — your password won't change.</p>`,
  })

  return { sent: true }
})
