import { randomBytes, createHash } from 'node:crypto'
import { eq, and, isNull } from 'drizzle-orm'
import { passwordResetTokens, users } from '~~/server/database/schema'
import { useRateLimit, getRateLimitKey } from '~~/server/utils/rateLimit'
import { sendMail } from '~~/server/utils/mailer'
import { buildPasswordResetEmail } from '~~/server/utils/emailI18n'
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
    .select({ id: users.id, email: users.email, preferredLocale: users.preferredLocale })
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

  const appUrl = useRuntimeConfig().public.appUrl.replace(/\/$/, '')
  const resetUrl = `${appUrl}/auth/reset-password?token=${rawToken}`

  const message = buildPasswordResetEmail(dbUser.preferredLocale, resetUrl)
  await sendMail({ to: dbUser.email, ...message })

  return { sent: true }
})
