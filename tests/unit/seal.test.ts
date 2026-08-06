import { describe, test, expect, beforeAll, vi } from 'vitest'

/**
 * `seal.ts` and the pending-2FA cookie built on it.
 *
 * These are security primitives, not I/O adapters, which is why they are unit-tested
 * rather than excluded from coverage: the whole second factor rests on a forged
 * `{ userId }` being impossible and an expired token being refused. A tampered payload
 * that unsealed successfully would let anyone skip 2FA outright.
 *
 * `createError` and h3's cookie helpers are Nitro auto-imports, so they are stubbed
 * before the modules load — the same pattern as `totp.test.ts`.
 */
const SECRET = 'x'.repeat(48)

beforeAll(() => {
  const g = globalThis as unknown as Record<string, unknown>
  g.createError = (o: unknown) =>
    Object.assign(new Error((o as { statusMessage?: string }).statusMessage ?? 'error'), o as object)
  process.env.NUXT_SESSION_PASSWORD = SECRET
})

const sealMod = () => import('../../server/utils/seal')

describe('seal / unseal', () => {
  test('round-trips a payload', async () => {
    const { seal, unseal } = await sealMod()
    const token = await seal({ userId: 42, issuedAt: 1_700_000_000_000 })
    expect(await unseal(token)).toEqual({ userId: 42, issuedAt: 1_700_000_000_000 })
  })

  test('is deterministic — no nonce, so the same payload seals identically', async () => {
    const { seal } = await sealMod()
    // Worth pinning: this is a MAC, not encryption. The payload is not secret and the
    // token is short-lived, so determinism is acceptable — but it should be a decision,
    // not a surprise to whoever reads the cookie.
    expect(await seal({ userId: 1 })).toBe(await seal({ userId: 1 }))
  })

  test('the payload is readable — this is authentication, not encryption', async () => {
    const { seal } = await sealMod()
    const token = await seal({ userId: 7 })
    const decoded = JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString('utf8'))
    expect(decoded).toEqual({ userId: 7 })
  })

  test('rejects a tampered payload', async () => {
    const { seal, unseal } = await sealMod()
    const token = await seal({ userId: 1 })
    const [, mac] = token.split('.')
    // The forgery that matters: swap the user id, keep the MAC.
    const forged = `${Buffer.from(JSON.stringify({ userId: 999 }), 'utf8').toString('base64url')}.${mac}`
    expect(await unseal(forged)).toBeNull()
  })

  test('rejects a tampered MAC', async () => {
    const { seal, unseal } = await sealMod()
    const token = await seal({ userId: 1 })
    const [body, mac] = token.split('.')
    const flipped = mac!.slice(0, -1) + (mac!.endsWith('A') ? 'B' : 'A')
    expect(await unseal(`${body}.${flipped}`)).toBeNull()
  })

  test('rejects a MAC of the wrong length without throwing', async () => {
    const { seal, unseal } = await sealMod()
    const [body] = (await seal({ userId: 1 })).split('.')
    // `timingSafeEqual` throws on a length mismatch, so the length is compared first.
    // If that guard were removed this would be a 500 instead of a clean rejection.
    await expect(unseal(`${body}.short`)).resolves.toBeNull()
  })

  test.each([
    ['no separator', 'justonepart'],
    ['empty body', '.abc'],
    ['empty mac', 'abc.'],
    ['empty string', ''],
  ])('rejects malformed input (%s)', async (_label, token) => {
    const { unseal } = await sealMod()
    expect(await unseal(token)).toBeNull()
  })

  test('rejects a validly-signed token whose body is not JSON', async () => {
    const { unseal } = await sealMod()
    const { createHmac } = await import('node:crypto')
    const body = Buffer.from('not json at all', 'utf8').toString('base64url')
    const mac = createHmac('sha256', SECRET).update(body).digest().toString('base64url')
    // A correct signature is not enough — the parse still has to succeed.
    expect(await unseal(`${body}.${mac}`)).toBeNull()
  })

  test('a token signed with a different secret does not verify', async () => {
    const { seal, unseal } = await sealMod()
    const token = await seal({ userId: 1 })

    process.env.NUXT_SESSION_PASSWORD = 'y'.repeat(48)
    try {
      // This is the intended consequence of sharing the session's trust root: rotating
      // the session secret invalidates these cookies too.
      expect(await unseal(token)).toBeNull()
    } finally {
      process.env.NUXT_SESSION_PASSWORD = SECRET
    }
  })

  test.each([
    ['unset', undefined],
    ['too short', 'short'],
  ])('refuses to sign when the session secret is %s', async (_label, value) => {
    const { seal } = await sealMod()
    const original = process.env.NUXT_SESSION_PASSWORD
    if (value === undefined) delete process.env.NUXT_SESSION_PASSWORD
    else process.env.NUXT_SESSION_PASSWORD = value

    try {
      // Fails closed. Signing with a weak or absent key would produce a forgeable token,
      // which is worse than a 500.
      await expect(seal({ userId: 1 })).rejects.toThrow(/Session secret is not configured/)
    } finally {
      process.env.NUXT_SESSION_PASSWORD = original
    }
  })
})

describe('pending-2FA cookie', () => {
  /** A fake h3 event: the module only ever passes it to the cookie helpers. */
  const fakeEvent = () => ({}) as never

  async function pendingMod(cookieValue?: string) {
    const g = globalThis as unknown as Record<string, unknown>
    const set = vi.fn()
    const del = vi.fn()
    g.setCookie = set
    g.deleteCookie = del
    g.getCookie = () => cookieValue
    return { mod: await import('../../server/utils/pendingTotp'), set, del }
  }

  test('round-trips the user id', async () => {
    const { mod, set } = await pendingMod()
    await mod.setPendingTotp(fakeEvent(), 123)

    const [, name, token, opts] = set.mock.calls[0]!
    expect(name).toBe('gm_totp_pending')
    expect(opts).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 300 })

    const { mod: reader } = await pendingMod(token)
    expect(await reader.readPendingTotp(fakeEvent())).toBe(123)
  })

  test('returns null with no cookie', async () => {
    const { mod } = await pendingMod(undefined)
    expect(await mod.readPendingTotp(fakeEvent())).toBeNull()
  })

  test('returns null for a forged cookie', async () => {
    const { seal } = await sealMod()
    const real = await seal({ userId: 1, issuedAt: Date.now() })
    const forgedBody = Buffer.from(JSON.stringify({ userId: 999, issuedAt: Date.now() })).toString('base64url')
    const { mod } = await pendingMod(`${forgedBody}.${real.split('.')[1]}`)
    expect(await mod.readPendingTotp(fakeEvent())).toBeNull()
  })

  test('refuses a token older than five minutes even though it verifies', async () => {
    const { seal } = await sealMod()
    // The cookie's own maxAge is not enough: a client can keep sending an expired
    // cookie, so the signed timestamp is the authority.
    const stale = await seal({ userId: 5, issuedAt: Date.now() - 6 * 60 * 1000 })
    const { mod } = await pendingMod(stale)
    expect(await mod.readPendingTotp(fakeEvent())).toBeNull()
  })

  test('accepts a token just inside the window', async () => {
    const { seal } = await sealMod()
    const fresh = await seal({ userId: 5, issuedAt: Date.now() - 4 * 60 * 1000 })
    const { mod } = await pendingMod(fresh)
    expect(await mod.readPendingTotp(fakeEvent())).toBe(5)
  })

  test('clearing removes the cookie on the same path it was set on', async () => {
    const { mod, del } = await pendingMod()
    mod.clearPendingTotp(fakeEvent())
    // A mismatched path would leave the cookie in place and the user stuck at the
    // second-factor step.
    expect(del).toHaveBeenCalledWith(expect.anything(), 'gm_totp_pending', { path: '/' })
  })
})
