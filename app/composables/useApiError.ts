/**
 * Turn a caught `$fetch` error into a message a user can actually read.
 *
 * ## Why this exists
 *
 * Endpoints throw `createError({ statusMessage: 'Invalid email or password' })` —
 * English, because that string is part of the API contract and is what lands in the
 * logs. Sixteen call sites then displayed it verbatim with
 * `err.data?.statusMessage || t('…')`, so a German, French or Italian user got the
 * raw English text whenever the server had anything specific to say. The
 * `|| t('…')` fallback only fired when the server said *nothing*, which is the one
 * case it was not needed for.
 *
 * ## What it does instead
 *
 * Maps the **HTTP status** to a translated message and never shows server text.
 * Status is the part that is stable and meaningful across locales; the prose is not.
 *
 * A missing `err.data` — which is what a dead or unreachable server produces —
 * becomes a distinct "could not reach the server" message rather than being
 * conflated with bad credentials. Those two are not the same problem and should not
 * read the same.
 *
 * ## Machine-readable codes
 *
 * An endpoint may add `data: { code: '…' }` to a `createError`, and a code listed in
 * `CODE_MESSAGES` below wins over the status mapping. That is the escape hatch this
 * docblock used to describe as future work, and it is opt-in per endpoint rather
 * than a change across all 41 at once.
 *
 * Only codes in that table are honoured, so an unmapped or attacker-influenced value
 * can never reach the screen — a code is a lookup key, never text to display.
 *
 * ## Known limitation
 *
 * Genuinely specific conflicts ("that branch name is taken") still collapse into the
 * generic 409 text until the endpoint opts in to a code.
 *
 * @example
 * try { await $fetch(…) } catch (e) { error.value = apiError(e, 'auth.loginError') }
 */
interface FetchLikeError {
  statusCode?: number
  status?: number
  response?: { status?: number }
  data?: { statusCode?: number; statusMessage?: string; code?: string }
}

/** Server error codes that have a specific translated message. See `data.code`. */
const CODE_MESSAGES: Record<string, string> = {
  /**
   * Thrown by `requireVerifiedUser`. Without this the create/publish form said
   * "you do not have permission to do that" — which reads as an account-permissions
   * problem and gives no hint that the fix is a link sitting in the user's inbox.
   */
  email_not_verified: 'errors.emailNotVerified',
  /** Thrown by `DELETE /api/ingredients/:id` when a commit has ever snapshotted it. */
  ingredient_in_use: 'errors.ingredientInUse',
}

export function useApiError() {
  const { t } = useI18n()

  /**
   * @param err       The caught error.
   * @param fallbackKey Optional i18n key for a context-specific message, used when
   *   the status has no better mapping (e.g. `auth.loginError` on a 401).
   */
  function apiError(err: unknown, fallbackKey?: string): string {
    const e = (err ?? {}) as FetchLikeError
    const status = e.data?.statusCode ?? e.statusCode ?? e.status ?? e.response?.status

    // A recognised code beats the status: it is the only thing the server can say
    // that is both specific and safe to translate.
    //
    // `hasOwn`, not a bare index: `CODE_MESSAGES.constructor` resolves to a function
    // off the prototype chain, and handing that to `t()` puts "[Function Object]" on
    // screen. Own keys only.
    const code = e.data?.code
    if (code && Object.hasOwn(CODE_MESSAGES, code)) return t(CODE_MESSAGES[code]!)

    // No status at all → the request never got an HTTP answer: server down, network
    // dropped, request aborted. Worth saying plainly; "check your credentials" would
    // send the user looking in the wrong place.
    if (!status) return t('errors.network')

    switch (status) {
      case 401:
      case 403:
        // Deliberately generic for auth: naming which half was wrong would enable
        // account enumeration.
        return fallbackKey ? t(fallbackKey) : t('errors.unauthorized')
      case 404:
        return t('errors.notFound')
      case 409:
        return t('errors.conflict')
      case 422:
        return t('errors.validation')
      case 429:
        return t('errors.rateLimited')
      case 503:
        return t('errors.unavailable')
      default:
        if (status >= 500) return t('errors.server')
        return fallbackKey ? t(fallbackKey) : t('errors.unknown')
    }
  }

  return { apiError }
}
