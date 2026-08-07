/**
 * POST /api/users/me/email — request an email address change
 *
 * Does NOT change `users.email`. It mints a token, mails a confirmation link to the
 * NEW address, and mails a plain notice (no link) to the OLD one. The switch itself
 * happens in `server/routes/auth/confirm-email-change.get.ts`, only once the new
 * address is confirmed — see that file, and the schema comment on `emailChangeTokens`,
 * for why confirming doubles as verifying.
 *
 * ## Why the current password is required
 *
 * A signed-in session is already enough to reach this endpoint, but a session can be
 * inherited — a shared machine, a stolen cookie, a forgotten tab. Changing the address
 * an account is reachable at is exactly the kind of action a passkey/password change
 * flow gates behind re-entering the password, and this is the same class of action:
 * get it wrong and the real owner can be locked out of their own account recovery.
 */
import { randomBytes, createHash } from 'node:crypto'
import { z } from 'zod'
import { eq, and, isNull, ne } from 'drizzle-orm'
import { emailChangeTokens, users } from '~~/server/database/schema'
import { useRateLimit, getRateLimitKey } from '~~/server/utils/rateLimit'
import { sendMail } from '~~/server/utils/mailer'
import { buildEmailChangeConfirmEmail, buildEmailChangeNoticeEmail } from '~~/server/utils/emailI18n'

const bodySchema = z.object({
  newEmail: z.string().email(),
  password: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  await useRateLimit(getRateLimitKey(event, 'users:email-change'), { max: 3, windowSeconds: 3600 })

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: parsed.error.flatten().fieldErrors })
  }
  const { newEmail, password } = parsed.data

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [dbUser] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      preferredLocale: users.preferredLocale,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)
  if (!dbUser) throw createError({ statusCode: 401, statusMessage: 'Unauthorized.' })

  const valid = await verifyPassword(dbUser.passwordHash, password)
  if (!valid) throw createError({ statusCode: 401, statusMessage: 'Incorrect password.' })

  if (newEmail.toLowerCase() === dbUser.email.toLowerCase()) {
    throw createError({ statusCode: 409, statusMessage: 'That is already your email address.' })
  }

  // Same address, different account — checked explicitly (rather than left to the unique
  // constraint on `users.email`) so this answers 409 instead of a raw SQL error, and so it
  // never collides with the CURRENT user's own row.
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, newEmail), ne(users.id, dbUser.id)))
    .limit(1)
  if (existing) throw createError({ statusCode: 409, statusMessage: 'That email address is already in use.' })

  // Invalidate any pending change for this account — same reasoning as the verification
  // and reset-password flows: the newest request is the one that should work, and an old
  // token left alive is one more way to end up confirming an address nobody asked for.
  await db
    .delete(emailChangeTokens)
    .where(and(eq(emailChangeTokens.userId, dbUser.id), isNull(emailChangeTokens.usedAt)))

  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 2) // 2h — matches password reset

  await db.insert(emailChangeTokens).values({ userId: dbUser.id, newEmail, tokenHash, expiresAt })

  const appUrl = useRuntimeConfig().public.appUrl.replace(/\/$/, '')
  const confirmUrl = `${appUrl}/auth/confirm-email-change?token=${rawToken}`

  const confirmMail = buildEmailChangeConfirmEmail(dbUser.preferredLocale, confirmUrl)
  await sendMail({ to: newEmail, ...confirmMail })

  // Best-effort: the change is already correctly pending even if this second mail fails to
  // send, and a delivery problem on the notice must not be reported back as a request that
  // failed outright — the confirmation mail above is the one that actually matters.
  try {
    const noticeMail = buildEmailChangeNoticeEmail(dbUser.preferredLocale, newEmail)
    await sendMail({ to: dbUser.email, ...noticeMail })
  } catch (err) {
    logger.error('email change: notice to the old address could not be sent', { userId: dbUser.id, err })
  }

  return { sent: true }
})
