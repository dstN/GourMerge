/**
 * POST /api/privacy/request — start a GDPR self-service flow.
 *
 * Asks for username AND email and requires both to match the same account.
 * Email alone would be enough to prove ownership (the confirmation link goes
 * there), but requiring the pair makes a blind "is this address registered"
 * probe useless even as a timing signal.
 *
 * Always responds `{ sent: true }`. Revealing that an account does not exist
 * would turn this endpoint into an enumeration oracle — the same reasoning as
 * in the password-reset route.
 */
import { randomBytes, createHash } from 'node:crypto'
import { eq, and, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { users, dataRequests } from '~~/server/database/schema'
import { useRateLimit, getRateLimitKey } from '~~/server/utils/rateLimit'
import { sendMail } from '~~/server/utils/mailer'
import { buildExportConfirmEmail, buildDeletionConfirmEmail } from '~~/server/utils/emailI18n'

const bodySchema = z.object({
  type: z.enum(['export', 'deletion']),
  username: z.string().min(1).max(50),
  email: z.string().email(),
})

/** Confirmation window. Short on purpose — the link authorises real action. */
const CONFIRM_TTL_MS = 1000 * 60 * 60 * 2

export default defineEventHandler(async (event) => {
  // Deliberately strict: this endpoint sends mail to an address the caller
  // supplies, so it doubles as a spam vector if left open.
  await useRateLimit(getRateLimitKey(event, 'privacy:request'), { max: 3, windowSeconds: 3600 })

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request.' })
  }
  const { type, username, email } = parsed.data

  const db = useDrizzle()
  if (!db) return { sent: true } // fail open — never expose DB state

  const [dbUser] = await db
    .select({
      id: users.id,
      email: users.email,
      preferredLocale: users.preferredLocale,
      anonymizedAt: users.anonymizedAt,
    })
    .from(users)
    .where(and(eq(users.username, username), eq(users.email, email)))
    .limit(1)

  // Unknown pair, or an account that was already erased: say nothing.
  if (!dbUser || dbUser.anonymizedAt) return { sent: true }

  // Supersede any pending request of the same type so a user who clicks twice
  // does not end up with two live tokens.
  await db
    .delete(dataRequests)
    .where(and(eq(dataRequests.userId, dbUser.id), eq(dataRequests.type, type), isNull(dataRequests.completedAt)))

  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')

  await db.insert(dataRequests).values({
    userId: dbUser.id,
    type,
    tokenHash,
    expiresAt: new Date(Date.now() + CONFIRM_TTL_MS),
  })

  const appUrl = useRuntimeConfig().public.appUrl.replace(/\/$/, '')
  const confirmUrl = `${appUrl}/legal/data-request/confirm?token=${rawToken}`

  const message =
    type === 'export'
      ? buildExportConfirmEmail(dbUser.preferredLocale, confirmUrl)
      : buildDeletionConfirmEmail(dbUser.preferredLocale, confirmUrl)

  // Send to the stored address, not the submitted one. They are equal here by
  // construction, but reading from the database keeps that guarantee local.
  await sendMail({ to: dbUser.email, ...message })

  return { sent: true }
})
