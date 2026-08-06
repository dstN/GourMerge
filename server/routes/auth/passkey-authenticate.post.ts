/**
 * POST /auth/passkey-authenticate — sign in with a passkey.
 *
 * ## A passkey replaces the whole login, not just the password
 *
 * No email, no password, no TOTP step. That is deliberate and worth being explicit
 * about, because it looks like a downgrade next to the two-step password flow and is
 * the opposite:
 *
 * - **The private key never leaves the authenticator.** There is no shared secret to
 *   phish, leak in a dump, or reuse from another site.
 * - **Unlocking it needs the device plus a biometric or PIN** — possession and
 *   inherence/knowledge. A password + TOTP is knowledge + possession. The passkey is
 *   at least as strong, and it is phishing-resistant, which TOTP is not: the origin is
 *   bound into the assertion, so a lookalike domain gets nothing.
 *
 * So demanding a TOTP code *after* a successful passkey assertion would add friction
 * without adding security, and would punish the users on the strongest credential.
 * TOTP remains the second factor for **password** logins; see
 * `server/routes/auth/login.post.ts`.
 *
 * ## Usernameless
 *
 * No `userName` is sent, so no `allowCredentials` is set and the browser offers
 * whichever discoverable passkeys it holds for this domain. The account is identified
 * by the credential id the authenticator returns — which is why
 * `user_passkeys.credential_id` is globally unique.
 */
import { eq } from 'drizzle-orm'
import type { WebAuthnCredential } from '#auth-utils'
import { userPasskeys, users } from '~~/server/database/schema'

/**
 * Transports are stored as a plain JSON string array, but the credential type wants a
 * union of known values. The values originate from the authenticator and are echoed back
 * untouched, so narrowing here is a type assertion, not a validation gap.
 *
 * The union is read off `WebAuthnCredential` rather than imported from
 * `@simplewebauthn/types`: that package is only a *transitive* dependency here, so
 * depending on it directly would break on any restructuring inside
 * `@simplewebauthn/server`. This also ties the narrowing to exactly the type the
 * consumer requires, so it cannot drift from it.
 */
type Transports = NonNullable<WebAuthnCredential['transports']>

function asTransports(value: string[] | null): Transports | undefined {
  return (value ?? undefined) as Transports | undefined
}

export default defineWebAuthnAuthenticateEventHandler({
  storeChallenge: (_event, challenge, attemptId) => storeWebauthnChallenge(challenge, attemptId),
  getChallenge: (_event, attemptId) => consumeWebauthnChallenge(attemptId),

  /**
   * The second bullet in the header — "unlocking it needs a biometric or PIN" — is the
   * entire reason this endpoint may skip the TOTP step. `userVerification: 'required'`
   * is what makes that true rather than aspirational; it must match the value used at
   * enrolment in `server/api/auth/passkeys/register.post.ts`.
   */
  getOptions: () => ({ userVerification: 'required' as const }),

  /**
   * Look up the credential the authenticator signed with. Throwing here (rather than
   * returning null) keeps the failure indistinguishable from a bad signature, so the
   * endpoint cannot be used to test whether a given credential id exists.
   */
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

    /**
     * Requested above, enforced here. `nuxt-auth-utils` verifies with a hardcoded
     * `requireUserVerification: false`, so a presence-only assertion — someone tapping
     * a key on an unlocked stolen laptop — would otherwise mint a full session and skip
     * both the password and the TOTP code. This is the check that makes the header's
     * "at least as strong" claim hold.
     */
    if (!authenticationInfo.userVerified) {
      logger.warn('passkey login refused: assertion without user verification', { userId })
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }

    /**
     * A counter that fails to advance is the spec's clone signal. `isCounterRegression`
     * deliberately tolerates `0`, because synced passkeys (iCloud, Google) always
     * report zero — rejecting that would break nearly every real passkey.
     */
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
