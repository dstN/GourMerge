/**
 * POST /auth/send-verification — re-send the verification mail to the signed-in user.
 *
 * The token minting and the mail itself live in `server/utils/emailVerification.ts`,
 * because registration sends the same message and the two must not drift.
 */
import { eq } from 'drizzle-orm'
import { users } from '~~/server/database/schema'
import { useRateLimit, getRateLimitKey } from '~~/server/utils/rateLimit'
import { issueEmailVerification } from '~~/server/utils/emailVerification'

export default defineEventHandler(async (event) => {
  await useRateLimit(getRateLimitKey(event, 'auth:send-verification'), { max: 3, windowSeconds: 3600 })

  const { user } = await requireUserSession(event)
  if (!user?.id) throw createError({ statusCode: 401 })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })
  const [dbUser] = await db
    .select({
      id: users.id,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      preferredLocale: users.preferredLocale,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)

  if (!dbUser) throw createError({ statusCode: 401 })
  if (dbUser.emailVerifiedAt) {
    return { alreadyVerified: true }
  }

  await issueEmailVerification(dbUser)

  return { sent: true }
})
