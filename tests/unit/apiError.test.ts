import { describe, test, expect, vi } from 'vitest'

/**
 * `useApiError` deliberately never shows the server's own `statusMessage`, because it
 * is English-only and part of the API contract rather than user copy. The cost of that
 * rule is that every 403 read the same: "you do not have permission to do that".
 *
 * That is wrong for the one 403 a user can actually resolve. `requireVerifiedUser`
 * rejects publishing until the address is confirmed, and the generic text sent people
 * hunting for a permissions problem that does not exist instead of at the link in
 * their inbox. `data.code` is the fix, and these tests pin the two halves of it: the
 * code must reach a specific message, and an unrecognised one must never reach the
 * screen at all.
 */

/**
 * The composable auto-imports `useI18n`, which needs a live Vue setup context. The
 * translations themselves are not what is under test here — the key that gets chosen
 * is — so `t` returns its key and the assertions read as the decision being made.
 */
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const { useApiError } = await import('../../app/composables/useApiError')

/** Shaped like an ofetch error: status and payload both live under `data`. */
function fetchError(statusCode: number, data: Record<string, unknown> = {}) {
  return { statusCode, data: { statusCode, ...data } }
}

describe('apiError — machine-readable codes', () => {
  const { apiError } = useApiError()

  test('email_not_verified resolves to its own message, not the generic 403 text', () => {
    const message = apiError(fetchError(403, { code: 'email_not_verified' }))
    expect(message).toBe('errors.emailNotVerified')
  })

  test('the code wins even when the call site passes a fallback key', () => {
    // The create-recipe form passes `recipe.createError`. "Could not create recipe" is
    // true but useless — it does not say what to do next.
    const message = apiError(fetchError(403, { code: 'email_not_verified' }), 'recipe.createError')
    expect(message).toBe('errors.emailNotVerified')
  })

  test('a 403 with no code stays generic', () => {
    expect(apiError(fetchError(403))).toBe('errors.unauthorized')
  })

  test('an unmapped code falls back to the status and is never echoed', () => {
    const message = apiError(fetchError(403, { code: 'totally_made_up' }))
    expect(message).toBe('errors.unauthorized')
    expect(message).not.toContain('totally_made_up')
  })

  test('a code cannot smuggle a lookup onto an unrelated object', () => {
    // `CODE_MESSAGES` is a plain object, so an inherited key would otherwise resolve.
    for (const code of ['constructor', 'toString', '__proto__']) {
      expect(apiError(fetchError(403, { code }))).toBe('errors.unauthorized')
    }
  })

  test('an error with no status at all is still reported as a network failure', () => {
    expect(apiError({})).toBe('errors.network')
  })
})
