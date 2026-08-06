/**
 * POST /api/auth/totp/setup — begin (or restart) TOTP enrolment.
 *
 * Generates a fresh secret and returns the enrolment URI plus a QR data-URI. The
 * row is stored **unconfirmed**: it does not gate login until the user proves
 * possession via `confirm.post.ts`. That ordering matters — writing a confirmed row
 * here would lock the user out if they abandoned setup half way.
 *
 * Re-running this replaces any unconfirmed secret, so a user who closed the dialog
 * can simply start again. It refuses to touch an already-confirmed enrolment:
 * changing that requires disabling 2FA first, which demands a password.
 */
import { eq } from 'drizzle-orm'
import QRCode from 'qrcode'
import { userTotp, users } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  // Enrolment is cheap but not free (crypto + QR render); throttle it anyway.
  await useRateLimit(getRateLimitKey(event, 'totp-setup'), { max: 10, windowSeconds: 300 })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const userId = session.user.id

  const [existing] = await db.select().from(userTotp).where(eq(userTotp.userId, userId)).limit(1)
  if (existing?.confirmedAt) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Two-factor authentication is already enabled. Disable it first to re-enrol.',
    })
  }

  const [user] = await db
    .select({ username: users.username, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!user) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  const secret = generateSecret()
  // The label is what shows up in the authenticator app's list, so it has to
  // identify the account without being the raw email (which apps display in full).
  const uri = buildOtpauthUri(secret, user.username)

  if (existing) {
    await db
      .update(userTotp)
      .set({ secretEncrypted: encryptSecret(secret), lastUsedCounter: null })
      .where(eq(userTotp.userId, userId))
  } else {
    await db.insert(userTotp).values({ userId, secretEncrypted: encryptSecret(secret) })
  }

  // Rendered server-side to a data: URI — the strict CSP forbids external image
  // hosts, and this keeps the secret out of any third party's hands.
  const qrDataUri = await QRCode.toDataURL(uri, { width: 240, margin: 1 })

  return {
    // Shown so the user can type it into an app that cannot scan.
    secret,
    uri,
    qrDataUri,
  }
})
