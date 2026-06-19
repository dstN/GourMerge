import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { passwordResetTokens, users } from '~~/server/database/schema'
import { useRateLimit, getRateLimitKey } from '~~/server/utils/rateLimit'
import { z } from 'zod'

// hashPassword is auto-imported by nuxt-auth-utils Nitro plugin

const bodySchema = z.object({
  token: z.string().min(32),
  password: z.string().min(8).max(128),
})

export default defineEventHandler(async (event) => {
  await useRateLimit(getRateLimitKey(event, 'auth:reset-password'), { max: 5, windowSeconds: 3600 })

  const body = await readBody(event)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid request.' })

  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex')
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [row] = await db
    .select({
      id: passwordResetTokens.id,
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt,
    })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1)

  if (!row) throw createError({ statusCode: 400, statusMessage: 'Invalid or expired token.' })
  if (row.usedAt) throw createError({ statusCode: 400, statusMessage: 'Token already used.' })
  if (new Date(row.expiresAt) < new Date()) throw createError({ statusCode: 400, statusMessage: 'Token expired.' })

  const newPasswordHash = await hashPassword(parsed.data.password)

  await db.transaction(async (tx) => {
    await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, row.id))

    await tx.update(users).set({ passwordHash: newPasswordHash }).where(eq(users.id, row.userId))
  })

  // Clear the session so the user must log in with the new password.
  await clearUserSession(event)

  return { success: true }
})
