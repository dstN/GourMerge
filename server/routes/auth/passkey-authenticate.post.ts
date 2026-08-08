/**
 * POST /auth/passkey-authenticate — sign in with a passkey. No email, no password, no
 * TOTP step: unlocking a passkey already needs the device plus biometric/PIN
 * (possession + inherence), at least as strong as password+TOTP and phishing-resistant
 * besides (origin-bound assertion). TOTP stays the second factor for password logins;
 * see login.post.ts.
 *
 * Usernameless: no `userName` sent means no `allowCredentials`, so the browser offers
 * whatever discoverable passkeys it holds for this domain — the account is resolved from
 * the returned credential id, which is why `user_passkeys.credential_id` is globally unique.
 */
import { eq } from 'drizzle-orm'
import type { WebAuthnCredential } from '#auth-utils'
import { userPasskeys, users } from '~~/server/database/schema'

// Transports are stored as a plain string array; narrowed to WebAuthnCredential's own union
// (not @simplewebauthn/types, a transitive-only dependency here) since the values are echoed
// back from the authenticator untouched — a type assertion, not a validation gap.
type Transports = NonNullable<WebAuthnCredential['transports']>

function asTransports(value: string[] | null): Transports | undefined {
  return (value ?? undefined) as Transports | undefined
}

export default defineWebAuthnAuthenticateEventHandler({
  storeChallenge: (_event, challenge, attemptId) => storeWebauthnChallenge(challenge, attemptId),
  getChallenge: (_event, attemptId) => consumeWebauthnChallenge(attemptId),

  // Must match enrolment's value in passkeys/register.post.ts — this is what makes the
  // "no TOTP step" skip above actually true rather than aspirational.
  getOptions: () => ({ userVerification: 'required' as const }),

  // Throws rather than returning null so a bad credential id and a bad signature look
  // identical — the endpoint can't be used to probe which credential ids exist.
  async getCredential(event, credentialId) {
    await useRateLimit(getRateLimitKey(event, 'passkey-auth'), { max: 10, windowSeconds: 300 })

    const db = useDrizzle()
    if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

    const [row] = await db.select().from(userPasskeys).where(eq(userPasskeys.credentialId, credentialId)).limit(1)

    if (!row) {
      logger.warn('passkey authentication with an unknown credential')
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }

    return {
      id: row.credentialId,
      publicKey: row.publicKey,
      counter: row.counter,
      backedUp: row.backedUp,
      transports: asTransports(row.transports),
      // Carried through to onSuccess via the interface's index signature, so the
      // owner is resolved by the ONE lookup that already had to happen.
      userId: row.userId,
    }
  },

  async onSuccess(event, { credential, authenticationInfo }) {
    const db = useDrizzle()
    if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

    const userId = Number(credential.userId)
    if (!Number.isInteger(userId) || userId <= 0) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }

    // nuxt-auth-utils verifies with a hardcoded requireUserVerification: false, so this check
    // is what actually stops a presence-only tap (e.g. an unlocked stolen laptop) from minting a session.
    if (!authenticationInfo.userVerified) {
      logger.warn('passkey login refused: assertion without user verification', { userId })
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }

    // isCounterRegression tolerates 0 — synced passkeys (iCloud, Google) always report zero.
    const received = authenticationInfo.newCounter ?? 0
    const [stored] = await db
      .select({ counter: userPasskeys.counter })
      .from(userPasskeys)
      .where(eq(userPasskeys.credentialId, credential.id))
      .limit(1)

    if (stored && isCounterRegression(stored.counter, received)) {
      logger.error('passkey counter regression — possible cloned credential', { userId })
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!user || user.isGhost) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

    // Session fixation: rotate before issuing, exactly as the password path does.
    await clearUserSession(event)
    await markPasskeyUsed(db, credential.id, received)

    // No TOTP step — see the header. `completeLogin` also stamps `last_login_at`,
    // which is what keeps an active passkey user off the inactivity-deletion path.
    await completeLogin(event, user)

    logger.info('passkey login', { userId })
  },
})
