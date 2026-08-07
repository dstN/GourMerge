/**
 * Mint an email-verification token and mail it — the one place that does so.
 *
 * ## Why this is a shared util and not inline in the handler
 *
 * It used to live only inside `POST /auth/send-verification`, and registration simply
 * did not send anything. That is a worse bug than it sounds: `email_verified_at` is
 * only ever set by `/auth/verify?token=…`, whose token only this code can issue, and
 * no client screen called the resend endpoint. So with
 * `REQUIRE_EMAIL_VERIFICATION=true` (production — see docs/RUNBOOK.md) every account
 * was permanently unverified, and `requireVerifiedUser` turned every attempt to
 * publish a public recipe, edit one to public, or open a GourMerge request into a 403
 * with no way out from inside the app.
 *
 * Registration is the natural moment to send it, so the token logic has to be
 * reachable from two places — hence here.
 *
 * Any unused token for the same user is invalidated first, so the newest mail is
 * always the one that works. Otherwise a resend leaves several live tokens and
 * "the link in my inbox" becomes ambiguous.
 */
import { randomBytes, createHash } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { emailVerificationTokens } from '~~/server/database/schema'
import { sendMail } from './mailer'
import { buildVerificationEmail } from './emailI18n'

/** Matches the 24h stated in the mail body itself (see emailMessages.ts). */
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24

export interface VerificationRecipient {
  id: number
  email: string
  preferredLocale?: string | null
}

/**
 * Whether unverified accounts are actually restricted.
 *
 * Read from `process.env` rather than `runtimeConfig` on purpose: nuxt.config is
 * evaluated at BUILD time, and Nitro only re-reads `NUXT_`-prefixed names at runtime,
 * so a `runtimeConfig` copy of this flag would be frozen to the build machine's value
 * (i.e. always false in production). See the note above `runtimeConfig` in nuxt.config.
 */
export function isEmailVerificationRequired(): boolean {
  return process.env.REQUIRE_EMAIL_VERIFICATION === 'true'
}

export async function issueEmailVerification(recipient: VerificationRecipient): Promise<void> {
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  await db
    .delete(emailVerificationTokens)
    .where(and(eq(emailVerificationTokens.userId, recipient.id), isNull(emailVerificationTokens.usedAt)))

  // CSPRNG, NOT UUIDv7 — a timestamp prefix would weaken unguessability.
  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)

  await db.insert(emailVerificationTokens).values({ userId: recipient.id, tokenHash, expiresAt })

  const appUrl = useRuntimeConfig().public.appUrl.replace(/\/$/, '')
  const verifyUrl = `${appUrl}/auth/verify?token=${rawToken}`

  const message = buildVerificationEmail(recipient.preferredLocale, verifyUrl)
  await sendMail({ to: recipient.email, ...message })
}
