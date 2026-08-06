/**
 * WebAuthn / passkey helpers.
 *
 * ## Why the challenge lives in the database
 *
 * A WebAuthn ceremony is two requests: one that issues a challenge, one that verifies
 * the signature over it. `nuxt-auth-utils` lets you store that challenge anywhere via
 * `storeChallenge`/`getChallenge`, and the obvious choice — the user session — is
 * wrong here for two reasons:
 *
 *   1. **Authentication begins with no session.** A passwordless login has nobody to
 *      attach a session to yet.
 *   2. **Passenger runs multiple processes.** Anything in memory breaks the moment the
 *      two halves land on different workers — the same constraint that made the rate
 *      limiter DB-backed.
 *
 * Rows are single-use (deleted on read) and short-lived, so a captured challenge
 * cannot be replayed.
 */
import { and, eq, gt, lt } from 'drizzle-orm'
import { userPasskeys, webauthnChallenges } from '~~/server/database/schema'

/** Long enough for a user to find their key and touch it; short enough to matter. */
const CHALLENGE_TTL_SECONDS = 5 * 60

type Db = NonNullable<ReturnType<typeof useDrizzle>>

export async function storeWebauthnChallenge(challenge: string, attemptId: string): Promise<void> {
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // Opportunistic cleanup, so an abandoned ceremony cannot accumulate forever even if
  // the nightly retention sweep is not running yet.
  await db.delete(webauthnChallenges).where(lt(webauthnChallenges.expiresAt, new Date()))

  await db.insert(webauthnChallenges).values({
    attemptId,
    challenge,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000),
  })
}

/**
 * Consume a challenge. **Single use**: the row is deleted whether or not verification
 * later succeeds, so a replayed attemptId finds nothing.
 */
export async function consumeWebauthnChallenge(attemptId: string): Promise<string> {
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [row] = await db
    .select({ id: webauthnChallenges.id, challenge: webauthnChallenges.challenge })
    .from(webauthnChallenges)
    .where(and(eq(webauthnChallenges.attemptId, attemptId), gt(webauthnChallenges.expiresAt, new Date())))
    .limit(1)

  if (!row) {
    throw createError({ statusCode: 400, statusMessage: 'This attempt expired. Please try again.' })
  }

  await db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, row.id))
  return row.challenge
}

/**
 * Advance the signature counter, rejecting a regression.
 *
 * A counter that goes backwards is the spec's signal of a **cloned credential**, so it
 * must fail. But the check has a subtlety that trips people up: most modern passkeys
 * are *synced* (iCloud Keychain, Google Password Manager) and always report `0`,
 * because a credential that legitimately exists on several devices cannot maintain a
 * single monotonic counter. Treating `0 → 0` as a regression would break every synced
 * passkey, which is to say almost all of them.
 *
 * So: `0` means "this authenticator does not count", and only a *decrease* from a
 * previously non-zero value is rejected.
 */
export function isCounterRegression(stored: number, received: number): boolean {
  if (received === 0) return false
  return received <= stored && stored !== 0
}

/** Record a successful assertion: bump the counter and stamp last use. */
export async function markPasskeyUsed(db: Db, credentialId: string, newCounter: number): Promise<void> {
  await db
    .update(userPasskeys)
    .set({ counter: newCounter, lastUsedAt: new Date() })
    .where(eq(userPasskeys.credentialId, credentialId))
}

/**
 * A sensible default label, so the list in settings is not three rows of "Passkey".
 * Derived from the user agent because the browser never tells us the device name.
 */
export function guessPasskeyName(userAgent: string | undefined): string {
  const ua = (userAgent ?? '').toLowerCase()
  if (ua.includes('iphone')) return 'iPhone'
  if (ua.includes('ipad')) return 'iPad'
  if (ua.includes('mac')) return 'Mac'
  if (ua.includes('android')) return 'Android'
  if (ua.includes('windows')) return 'Windows'
  if (ua.includes('linux')) return 'Linux'
  return 'Passkey'
}
