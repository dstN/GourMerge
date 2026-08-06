import { describe, test, expect, beforeAll } from 'vitest'

/**
 * `server/utils/webauthn.ts` reaches for Nitro auto-imports (`createError`, `useDrizzle`)
 * at call time, so a bare vitest environment needs stubs before the module is loaded —
 * the same approach as `totp.test.ts`. Only the pure helpers are exercised here; the
 * challenge store is DB-backed and is proved by `tests/e2e/passkey.spec.ts`, which runs
 * both real ceremonies against a real database.
 */
beforeAll(() => {
  const g = globalThis as unknown as { createError?: (o: unknown) => Error; useDrizzle?: () => null }
  g.createError = (o) => Object.assign(new Error((o as { statusMessage?: string }).statusMessage ?? 'error'), o)
  g.useDrizzle = () => null
})

const mod = () => import('../../server/utils/webauthn')

describe('isCounterRegression', () => {
  /**
   * The whole point of the signature counter is clone detection, and the whole trap is
   * that synced passkeys (iCloud Keychain, Google Password Manager) always report `0` —
   * a credential that legitimately lives on several devices cannot keep one monotonic
   * counter. Rejecting `0` would lock out almost every real passkey.
   */
  test('tolerates a non-counting authenticator (received 0)', async () => {
    const { isCounterRegression } = await mod()
    expect(isCounterRegression(0, 0)).toBe(false)
    expect(isCounterRegression(5, 0), 'a synced key may report 0 after a counting one').toBe(false)
    expect(isCounterRegression(9999, 0)).toBe(false)
  })

  test('accepts a counter that advances', async () => {
    const { isCounterRegression } = await mod()
    expect(isCounterRegression(0, 1)).toBe(false)
    expect(isCounterRegression(1, 2)).toBe(false)
    expect(isCounterRegression(41, 42)).toBe(false)
  })

  test('rejects a counter that repeats or goes backwards', async () => {
    const { isCounterRegression } = await mod()
    expect(isCounterRegression(7, 7), 'replay of the same assertion').toBe(true)
    expect(isCounterRegression(7, 6), 'clone signal').toBe(true)
    expect(isCounterRegression(7, 1)).toBe(true)
  })

  test('a first use from a counting authenticator is not a regression', async () => {
    const { isCounterRegression } = await mod()
    // Stored 0 means "nothing recorded yet", so any positive value is progress.
    expect(isCounterRegression(0, 42)).toBe(false)
  })
})

describe('guessPasskeyName', () => {
  /**
   * The name is only a default label, but it is the only thing distinguishing rows in
   * settings — and you can only safely revoke a key you can identify.
   */
  test.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone'],
    ['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 'iPad'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Mac'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'Android'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Windows'],
    ['Mozilla/5.0 (X11; Linux x86_64)', 'Linux'],
  ])('%s → %s', async (ua, expected) => {
    const { guessPasskeyName } = await mod()
    expect(guessPasskeyName(ua)).toBe(expected)
  })

  test('iPhone and iPad win over the "Mac OS X" their UA also contains', async () => {
    const { guessPasskeyName } = await mod()
    // Both iOS user agents include "like Mac OS X", so order of the checks matters.
    expect(guessPasskeyName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).not.toBe('Mac')
    expect(guessPasskeyName('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).not.toBe('Mac')
  })

  test('Android wins over the "Linux" its UA also contains', async () => {
    const { guessPasskeyName } = await mod()
    expect(guessPasskeyName('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('Android')
  })

  test('falls back rather than throwing on a missing or unknown agent', async () => {
    const { guessPasskeyName } = await mod()
    expect(guessPasskeyName(undefined)).toBe('Passkey')
    expect(guessPasskeyName('')).toBe('Passkey')
    expect(guessPasskeyName('curl/8.5.0')).toBe('Passkey')
  })

  test('is case-insensitive', async () => {
    const { guessPasskeyName } = await mod()
    expect(guessPasskeyName('WINDOWS NT 10.0')).toBe('Windows')
  })
})

describe('challenge store without a database', () => {
  /**
   * Fails closed. A ceremony that cannot persist its challenge must not fall back to
   * an empty one — `nuxt-auth-utils` treats `challenge: ''` as "skip the check", so a
   * silent failure here would accept a signature over anything.
   */
  test('refuses to store or consume', async () => {
    const { storeWebauthnChallenge, consumeWebauthnChallenge } = await mod()
    await expect(storeWebauthnChallenge('c', 'a')).rejects.toThrow(/Database unavailable/)
    await expect(consumeWebauthnChallenge('a')).rejects.toThrow(/Database unavailable/)
  })
})
