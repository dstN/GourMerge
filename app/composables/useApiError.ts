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
 * ## Known limitation
 *
 * Genuinely specific conflicts ("that branch name is taken") collapse into the
 * generic 409 text. Fixing that properly means the server returning a stable
 * machine-readable code in `data` that the client maps — worth doing, but it is a
 * change across all 41 endpoints. Status-based mapping is strictly better than
 * untranslated English in the meantime.
 *
 * @example
 * try { await $fetch(…) } catch (e) { error.value = apiError(e, 'auth.loginError') }
 */
interface FetchLikeError {
  statusCode?: number
  status?: number
  response?: { status?: number }
  data?: { statusCode?: number; statusMessage?: string }
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
