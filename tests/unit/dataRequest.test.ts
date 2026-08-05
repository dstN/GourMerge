import { describe, test, expect } from 'vitest'
import { createHash, randomBytes } from 'node:crypto'
import { hashToken } from '../../server/utils/dataRequest'

/**
 * `hashToken` is the security primitive behind the GDPR self-service flow: the
 * raw token exists only inside the user's inbox, and the database stores this
 * hash. If it ever became reversible, non-deterministic, or accidentally
 * truncated, an attacker with database read access could mint working export
 * links — which return every piece of personal data we hold.
 */
describe('hashToken', () => {
  test('produces a 64-char lowercase sha256 hex digest', () => {
    const out = hashToken('a'.repeat(64))
    expect(out).toMatch(/^[0-9a-f]{64}$/)
  })

  test('is deterministic — the same token always resolves to the same row', () => {
    const raw = randomBytes(32).toString('hex')
    expect(hashToken(raw)).toBe(hashToken(raw))
  })

  test('matches a plain sha256 of the input', () => {
    const raw = randomBytes(32).toString('hex')
    expect(hashToken(raw)).toBe(createHash('sha256').update(raw).digest('hex'))
  })

  test('differs for inputs that differ by a single character', () => {
    // Guards against a truncating or prefix-only implementation, which would
    // collapse distinct tokens onto one row.
    const a = 'b'.repeat(64)
    const b = 'b'.repeat(63) + 'c'
    expect(hashToken(a)).not.toBe(hashToken(b))
  })

  test('does not leak the raw token into its output', () => {
    const raw = 'super-secret-token-value-0123456789abcdef'
    expect(hashToken(raw)).not.toContain(raw)
  })
})
