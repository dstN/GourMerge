/**
 * Cookie consent state, shared by the banner/settings modal and by anything
 * that needs to check before writing a cookie of its own.
 *
 * `necessary` (session cookie, 2FA-pending cookie, locale, onboarding-seen)
 * cannot be opted out of — the site cannot function without them, so the UI
 * only surfaces `statistics` and `marketing` as real choices. Both are not
 * wired to anything yet — they exist so a future analytics/marketing script
 * has a `hasConsent()` check to gate on instead of a second consent-manager
 * rewrite.
 */

export interface OptionalConsentCategories {
  statistics: boolean
  marketing: boolean
}

const CONSENT_COOKIE = 'gm_cookie_consent'
const CONSENT_VERSION = 1

interface StoredConsent extends OptionalConsentCategories {
  v: number
}

export function useCookieConsent() {
  const persisted = useCookie<StoredConsent | null>(CONSENT_COOKIE, {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    default: () => null,
  })

  const isSettingsOpen = useState('cookieConsentSettingsOpen', () => false)

  const consent = computed<OptionalConsentCategories | null>(() => {
    if (persisted.value && persisted.value.v === CONSENT_VERSION) {
      return { statistics: persisted.value.statistics, marketing: persisted.value.marketing }
    }
    return null
  })

  const hasDecided = computed(() => consent.value !== null)

  function apply(next: OptionalConsentCategories) {
    persisted.value = { ...next, v: CONSENT_VERSION }
    isSettingsOpen.value = false
  }

  function acceptAll() {
    apply({ statistics: true, marketing: true })
  }

  function acceptNecessaryOnly() {
    apply({ statistics: false, marketing: false })
  }

  function openSettings() {
    isSettingsOpen.value = true
  }

  function hasConsent(category: keyof OptionalConsentCategories) {
    return consent.value?.[category] === true
  }

  return {
    consent,
    hasDecided,
    isSettingsOpen,
    apply,
    acceptAll,
    acceptNecessaryOnly,
    openSettings,
    hasConsent,
  }
}
