import { test, expect } from '@playwright/test'
import type { BrowserContext, CDPSession, Page } from '@playwright/test'
import { resetRateLimits } from './support/db'
import { registerUser, uniqueUser } from './support/api'
import type { TestUser } from './support/api'

/**
 * Passkeys, driven through Chrome's WebAuthn virtual authenticator over CDP.
 *
 * Nothing weaker proves anything here. The browser will not produce an assertion
 * without an authenticator, and stubbing `navigator.credentials` would only test the
 * stub — the parts that can actually break (discoverability, user verification,
 * signature checking) all live below that line.
 *
 * Two properties are load-bearing and each has cost a bug already:
 *
 *  1. **Discoverability.** Usernameless login sends no `allowCredentials`, so the
 *     credential must be a resident key. `nuxt-auth-utils` passes its own
 *     `authenticatorSelection`, which replaces SimpleWebAuthn's default outright and
 *     drops `residentKey` to "discouraged" — a passkey that enrols and can never sign in.
 *  2. **User verification.** A passkey assertion skips both the password and the TOTP
 *     code, which is only defensible if a biometric or PIN was checked. The library
 *     verifies with a hardcoded `requireUserVerification: false`, so the app enforces it.
 *
 * Everything runs on a single page load: navigating with a virtual authenticator
 * attached crashes the renderer under CDP, so the ceremonies are driven in-page against
 * the same endpoints the UI calls.
 */

/** Base64url ↔ bytes, as source strings because they are `eval`ed inside the page. */
const B64_TO_BYTES = `(s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))`
const BYTES_TO_B64 = `(b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '')`
const HELPERS = { b64: B64_TO_BYTES, u8: BYTES_TO_B64 }

/**
 * Attach a virtual platform authenticator. `userVerifying: false` models a device that
 * only proves presence — a security key with no PIN — which is exactly the case the
 * app must refuse.
 */
async function attachAuthenticator(context: BrowserContext, page: Page, userVerifying = true): Promise<CDPSession> {
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: userVerifying,
      isUserVerified: userVerifying,
      automaticPresenceSimulation: true,
    },
  })
  return cdp
}

/** Open the login page and wait for hydration, without navigating again afterwards. */
async function openLoginPage(page: Page): Promise<void> {
  await page.goto('/auth/login', { waitUntil: 'load' })
  await page
    .waitForFunction(() => !!(document.querySelector('#__nuxt') as unknown as { __vnode?: unknown })?.__vnode, null, {
      timeout: 30_000,
    })
    .catch(() => {
      // Hydration is a convenience for the button assertion, not a precondition for
      // the ceremonies — those are plain fetches.
    })
}

/** Log in with a password inside the page, so the session cookie lands in the page jar. */
async function passwordLogin(page: Page, user: TestUser): Promise<void> {
  const res = await page.evaluate(async (u) => {
    const r = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email, password: u.password }),
    })
    return { status: r.status, body: await r.json() }
  }, user)
  expect(res.status, `password login failed: ${JSON.stringify(res.body)}`).toBe(200)
}

/** Run the full two-round-trip registration ceremony against the real endpoint. */
async function enrolPasskey(page: Page): Promise<{ status: number; verified?: boolean; error?: string }> {
  return page.evaluate(async (h) => {
    const toBytes = eval(h.b64) as (s: string) => Uint8Array
    const toB64 = eval(h.u8) as (b: ArrayBuffer) => string
    const ENDPOINT = '/api/auth/passkeys/register'
    const body = (extra: Record<string, unknown>) => JSON.stringify({ user: { userName: 'session' }, ...extra })

    const begin = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body({ verify: false }),
    }).then((r) => r.json())

    const o = begin.creationOptions
    let pk: PublicKeyCredential
    try {
      pk = (await navigator.credentials.create({
        publicKey: {
          ...o,
          challenge: toBytes(o.challenge),
          user: { ...o.user, id: toBytes(o.user.id) },
          excludeCredentials: (o.excludeCredentials ?? []).map((c: { id: string }) => ({ ...c, id: toBytes(c.id) })),
        },
      })) as PublicKeyCredential
    } catch (e) {
      // A device that cannot satisfy `userVerification: 'required'` is rejected by the
      // browser before the server ever sees it. That is a pass, not an error.
      return { status: 0, error: (e as Error).name }
    }
    const att = pk.response as AuthenticatorAttestationResponse

    const verify = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body({
        attemptId: begin.attemptId,
        verify: true,
        response: {
          id: pk.id,
          rawId: toB64(pk.rawId),
          type: pk.type,
          clientExtensionResults: pk.getClientExtensionResults(),
          response: {
            clientDataJSON: toB64(att.clientDataJSON),
            attestationObject: toB64(att.attestationObject),
            transports: att.getTransports ? att.getTransports() : [],
          },
        },
      }),
    })
    return { status: verify.status, verified: (await verify.json()).verified }
  }, HELPERS)
}

/** Run the usernameless authentication ceremony — no email, no `allowCredentials`. */
async function authenticateWithPasskey(page: Page): Promise<{ status: number; verified?: boolean; error?: string }> {
  return page.evaluate(async (h) => {
    const toBytes = eval(h.b64) as (s: string) => Uint8Array
    const toB64 = eval(h.u8) as (b: ArrayBuffer) => string
    const ENDPOINT = '/auth/passkey-authenticate'

    const begin = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verify: false }),
    }).then((r) => r.json())

    const o = begin.requestOptions
    let pk: PublicKeyCredential
    try {
      pk = (await navigator.credentials.get({
        // Empty on purpose: only a discoverable credential can answer this.
        publicKey: { ...o, challenge: toBytes(o.challenge), allowCredentials: [] },
      })) as PublicKeyCredential
    } catch (e) {
      return { status: 0, error: (e as Error).name }
    }
    const a = pk.response as AuthenticatorAssertionResponse

    const verify = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attemptId: begin.attemptId,
        verify: true,
        response: {
          id: pk.id,
          rawId: toB64(pk.rawId),
          type: pk.type,
          clientExtensionResults: pk.getClientExtensionResults(),
          response: {
            clientDataJSON: toB64(a.clientDataJSON),
            authenticatorData: toB64(a.authenticatorData),
            signature: toB64(a.signature),
            userHandle: a.userHandle ? toB64(a.userHandle) : undefined,
          },
        },
      }),
    })
    return { status: verify.status, verified: (await verify.json()).verified }
  }, HELPERS)
}

const json = (page: Page, url: string) => page.evaluate((u) => fetch(u).then((r) => r.json()), url)
const status = (page: Page, url: string) => page.evaluate((u) => fetch(u).then((r) => r.status), url)

test.describe('passkeys', () => {
  test('enrol, then sign in with no email, no password and no TOTP', async ({ page, context, request }) => {
    await resetRateLimits()
    const user = uniqueUser('pk')
    await registerUser(request, user)

    await openLoginPage(page)
    await attachAuthenticator(context, page)

    // The button is client-side feature-detected, so this also proves the detection works.
    await expect(page.getByRole('button', { name: /mit passkey anmelden|sign in with a passkey/i })).toBeVisible()

    await passwordLogin(page, user)

    const enrol = await enrolPasskey(page)
    expect(enrol.verified, `enrolment should verify (${JSON.stringify(enrol)})`).toBe(true)

    const listed = await json(page, '/api/auth/passkeys')
    expect(listed.passkeys).toHaveLength(1)
    expect(listed.passkeys[0].name, 'a distinguishable default name').toBeTruthy()
    expect(listed.passkeys[0].lastUsedAt, 'never used yet').toBeNull()

    // Drop every trace of the password session: what follows must stand on the passkey alone.
    await context.clearCookies()
    await resetRateLimits()
    expect(await status(page, '/api/auth/passkeys'), 'session must be gone').toBe(401)

    const auth = await authenticateWithPasskey(page)
    expect(auth.verified, `assertion should verify (${JSON.stringify(auth)})`).toBe(true)

    const session = await json(page, '/api/_auth/session')
    expect(session?.user?.username, 'signed in as the passkey owner').toBe(user.username)

    const after = await json(page, '/api/auth/passkeys')
    expect(after.passkeys[0].lastUsedAt, 'lastUsedAt should be stamped').not.toBeNull()
  })

  test('a presence-only authenticator cannot enrol a passkey', async ({ page, context, request }) => {
    await resetRateLimits()
    const user = uniqueUser('pknouv')
    await registerUser(request, user)

    await openLoginPage(page)
    await attachAuthenticator(context, page, false)
    await passwordLogin(page, user)

    const enrol = await enrolPasskey(page)

    /**
     * Either outcome is correct, and which one occurs is Chrome's call: the browser may
     * refuse `userVerification: 'required'` outright, or produce a presence-only
     * attestation that the server then rejects. What must never happen is a stored key —
     * that would be a passkey able to bypass the password and the TOTP code without any
     * biometric or PIN.
     */
    expect(enrol.verified, `presence-only enrolment must not succeed (${JSON.stringify(enrol)})`).not.toBe(true)
    if (enrol.status !== 0) expect(enrol.status).toBe(400)

    const listed = await json(page, '/api/auth/passkeys')
    expect(listed.passkeys, 'nothing may be stored').toHaveLength(0)
  })
})
