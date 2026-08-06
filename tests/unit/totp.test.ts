import { describe, test, expect, beforeAll } from 'vitest'
import { TOTP, Secret } from 'otpauth'

/**
 * `server/utils/totp.ts` calls `createError` (a Nitro auto-import) inside its key
 * derivation, so it cannot be imported into a bare vitest environment without a
 * stub. Providing one is cheaper than restructuring the module, and the stub is only
 * reached on the misconfiguration path — which is itself worth testing.
 */
beforeAll(() => {
  ;(globalThis as unknown as { createError: (o: unknown) => Error }).createError = (o) =>
    Object.assign(new Error((o as { statusMessage?: string }).statusMessage ?? 'error'), o)
  process.env.TOTP_ENCRYPTION_KEY = 'a'.repeat(48)
})

const mod = () => import('../../server/utils/totp')

describe('secret encryption', () => {
  test('round-trips a secret', async () => {
    const { encryptSecret, decryptSecret, generateSecret } = await mod()
    const secret = generateSecret()
    expect(decryptSecret(encryptSecret(secret))).toBe(secret)
  })

  test('ciphertext differs every time (random IV)', async () => {
    const { encryptSecret } = await mod()
    // A deterministic ciphertext would let anyone with DB read access spot which
    // accounts share a secret, and would break GCM's security guarantee outright.
    expect(encryptSecret('JBSWY3DPEHPK3PXP')).not.toBe(encryptSecret('JBSWY3DPEHPK3PXP'))
  })

  test('a tampered payload is rejected rather than silently decrypted', async () => {
    const { encryptSecret, decryptSecret } = await mod()
    const sealed = encryptSecret('JBSWY3DPEHPK3PXP')
    const [iv, tag, data] = sealed.split(':')
    // Flip a byte in the ciphertext. GCM must fail the auth tag check.
    const flipped = Buffer.from(data!, 'base64')
    flipped[0] ^= 0xff
    expect(() => decryptSecret(`${iv}:${tag}:${flipped.toString('base64')}`)).toThrow()
  })

  test('a malformed stored value throws instead of returning garbage', async () => {
    const { decryptSecret } = await mod()
    expect(() => decryptSecret('not-a-sealed-value')).toThrow()
  })
})

describe('otpauth URI', () => {
  test('uses the parameters every authenticator app understands', async () => {
    const { buildOtpauthUri, generateSecret } = await mod()
    const uri = buildOtpauthUri(generateSecret(), 'testkoch')

    // These three are the interoperability contract. Google Authenticator IGNORES
    // non-default algorithm/digits and assumes SHA1/6 — so a "stronger" secret
    // imports cleanly and then produces codes that never validate. Do not change
    // these without re-reading server/utils/totp.ts's header.
    expect(uri).toContain('algorithm=SHA1')
    expect(uri).toContain('digits=6')
    expect(uri).toContain('period=30')
    expect(uri).toMatch(/^otpauth:\/\/totp\//)
    expect(uri).toContain('issuer=GourMerge')
    expect(uri).toContain('testkoch')
  })
})

describe('verifyTotp', () => {
  const secretOf = () => 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
  const codeAt = (offsetSteps = 0) =>
    new TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: Secret.fromBase32(secretOf()) }).generate({
      timestamp: Date.now() + offsetSteps * 30_000,
    })

  test('accepts the current code and reports its step', async () => {
    const { verifyTotp } = await mod()
    const res = verifyTotp(secretOf(), codeAt(), null)
    expect(res.valid).toBe(true)
    expect(typeof res.counter).toBe('number')
  })

  test('tolerates one step of clock drift in both directions', async () => {
    const { verifyTotp } = await mod()
    expect(verifyTotp(secretOf(), codeAt(-1), null).valid).toBe(true)
    expect(verifyTotp(secretOf(), codeAt(1), null).valid).toBe(true)
  })

  test('rejects drift beyond the window', async () => {
    const { verifyTotp } = await mod()
    expect(verifyTotp(secretOf(), codeAt(5), null).valid).toBe(false)
    expect(verifyTotp(secretOf(), codeAt(-5), null).valid).toBe(false)
  })

  test('rejects a replay of an already-accepted step', async () => {
    const { verifyTotp } = await mod()
    const first = verifyTotp(secretOf(), codeAt(), null)
    expect(first.valid).toBe(true)
    // A code is valid for its whole 30s window. Without this guard an intercepted
    // code could be reused inside that window.
    expect(verifyTotp(secretOf(), codeAt(), first.counter!).valid).toBe(false)
  })

  test('accepts a later step once an earlier one was used', async () => {
    const { verifyTotp } = await mod()
    const first = verifyTotp(secretOf(), codeAt(), null)
    expect(verifyTotp(secretOf(), codeAt(1), first.counter!).valid).toBe(true)
  })

  test('rejects anything that is not six digits', async () => {
    const { verifyTotp } = await mod()
    for (const bad of ['', '12345', '1234567', 'abcdef', '12 34 56 78']) {
      expect(verifyTotp(secretOf(), bad, null).valid).toBe(false)
    }
  })

  test('ignores surrounding whitespace, which apps often include', async () => {
    const { verifyTotp } = await mod()
    expect(verifyTotp(secretOf(), ` ${codeAt()} `, null).valid).toBe(true)
  })
})

describe('recovery codes', () => {
  test('issues ten distinct codes', async () => {
    const { generateRecoveryCodes } = await mod()
    const codes = generateRecoveryCodes()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
  })

  test('uses an unambiguous alphabet in a readable shape', async () => {
    const { generateRecoveryCodes } = await mod()
    for (const code of generateRecoveryCodes()) {
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/)
      // 0/O and 1/I/L are excluded so a hand-copied code cannot be misread.
      expect(code).not.toMatch(/[01OIL]/)
    }
  })

  test('two batches never collide', async () => {
    const { generateRecoveryCodes } = await mod()
    const a = generateRecoveryCodes()
    const b = generateRecoveryCodes()
    expect(a.filter((c) => b.includes(c))).toHaveLength(0)
  })

  test('normalization makes user input forgiving', async () => {
    const { normalizeRecoveryCode } = await mod()
    expect(normalizeRecoveryCode('  a3f9k-tm2qx ')).toBe('A3F9K-TM2QX')
    expect(normalizeRecoveryCode('A3F9K -TM2QX')).toBe('A3F9K-TM2QX')
  })
})

describe('configuration guard', () => {
  test('refuses to operate without a long enough key', async () => {
    const original = process.env.TOTP_ENCRYPTION_KEY
    const originalSession = process.env.NUXT_SESSION_PASSWORD
    process.env.TOTP_ENCRYPTION_KEY = 'too-short'
    delete process.env.NUXT_SESSION_PASSWORD
    try {
      const { encryptSecret } = await mod()
      // Failing loudly beats silently encrypting every secret under a weak key.
      expect(() => encryptSecret('JBSWY3DPEHPK3PXP')).toThrow()
    } finally {
      process.env.TOTP_ENCRYPTION_KEY = original
      if (originalSession) process.env.NUXT_SESSION_PASSWORD = originalSession
    }
  })
})
