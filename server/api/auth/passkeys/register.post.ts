/**
 * POST /api/auth/passkeys/register — enrol a passkey on the signed-in account.
 *
 * Registration requires an existing session. That is the trust anchor: proving you
 * already control the account is what makes the new key legitimately yours. An
 * unauthenticated registration endpoint would let anyone attach their own
 * authenticator to someone else's account.
 *
 * Two round-trips, both through this handler (`nuxt-auth-utils` switches on
 * `body.verify`): first it returns creation options, then it verifies the attestation.
 * The challenge is stored in the database between them — see `server/utils/webauthn.ts`
 * for why not the session.
 */
import { eq } from 'drizzle-orm'
import { userPasskeys, users } from '~~/server/database/schema'

export default defineWebAuthnRegisterEventHandler({
  storeChallenge: (_event, challenge, attemptId) => storeWebauthnChallenge(challenge, attemptId),
  getChallenge: (_event, attemptId) => consumeWebauthnChallenge(attemptId),

  /**
   * Both of these must be stated explicitly, and neither is a nicety.
   *
   * `residentKey: 'required'` makes the credential *discoverable*, which is what lets
   * the login page ask for a passkey without first asking who you are. Leaving it out
   * is not a softer default — `nuxt-auth-utils` passes its own `authenticatorSelection`
   * object, which replaces SimpleWebAuthn's default wholesale, so `residentKey` lands
   * on "discouraged" and the key becomes invisible to a usernameless request. Skipping
   * this produced a passkey that enrolled fine and could never be used to sign in.
   *
   * `userVerification: 'required'` is what earns this factor the right to stand in for
   * the password *and* the TOTP code: the authenticator must confirm a biometric or PIN,
   * not merely that someone touched it. Presence alone would make a stolen unlocked
   * device a full account takeover.
   */
  getOptions: () => ({
    authenticatorSelection: {
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'required',
    },
  }),

  /**
   * The client sends a `userName`, but we must never trust it: honouring it would let
   * a signed-in user register a key against a different account. The session is the
   * only authority, so the submitted value is discarded and replaced.
   */
  async validateUser(_userBody, event) {
    const session = await requireUserSession(event)
    await useRateLimit(getRateLimitKey(event, 'passkey-register'), { max: 10, windowSeconds: 300 })

    const db = useDrizzle()
    if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

    const [user] = await db
      .select({ id: users.id, username: users.username, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1)
    if (!user) throw createError({ statusCode: 404, statusMessage: 'User not found' })

    return {
      userName: user.username,
      displayName: user.displayName ?? user.username,
    }
  },

  /**
   * Hand the authenticator the keys it already holds for this account, so it can warn
   * "you already have a passkey here" instead of silently creating a duplicate the
   * user cannot tell apart.
   */
  async excludeCredentials(event, _userName) {
    const session = await getUserSession(event)
    if (!session?.user) return []
    const db = useDrizzle()
    if (!db) return []

    const rows = await db
      .select({ id: userPasskeys.credentialId, transports: userPasskeys.transports })
      .from(userPasskeys)
      .where(eq(userPasskeys.userId, session.user.id))

    return rows.map((r) => ({ id: r.id, transports: (r.transports ?? undefined) as never }))
  },

  async onSuccess(event, { credential, registrationInfo }) {
    const session = await requireUserSession(event)

    /**
     * Asking for `userVerification: 'required'` above is a request; this is the check.
     * `nuxt-auth-utils` calls `verifyRegistrationResponse` with a hardcoded
     * `requireUserVerification: false` (its own TODO), so the library will happily accept
     * a presence-only attestation. Storing that key would quietly create a
     * password-and-2FA bypass, so it is refused here instead.
     */
    if (!registrationInfo.userVerified) {
      logger.warn('passkey registration refused: no user verification', { userId: session.user.id })
      throw createError({
        statusCode: 400,
        statusMessage: 'This device did not verify who you are. A passkey needs a fingerprint, face or PIN.',
      })
    }

    const db = useDrizzle()
    if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

    // A label the user can actually distinguish, guessed from the UA because the
    // browser never reveals the device name. Renameable afterwards.
    const name = guessPasskeyName(getHeader(event, 'user-agent'))

    await db.insert(userPasskeys).values({
      userId: session.user.id,
      credentialId: credential.id,
      publicKey: credential.publicKey,
      counter: credential.counter ?? 0,
      backedUp: Boolean(credential.backedUp),
      transports: (credential.transports as string[] | undefined) ?? null,
      name,
    })

    logger.info('passkey registered', { userId: session.user.id, backedUp: Boolean(credential.backedUp) })
  },
})
