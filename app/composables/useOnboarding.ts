/**
 * Manages onboarding state for logged-in users.
 * Reads from the user session; persists to the API + a cookie fallback for
 * not-yet-authenticated visitors.
 */

declare module '#auth-utils' {
  interface User {
    onboardingCompletedAt?: string | null
    tourDismissed?: boolean
  }
}

export function useOnboarding() {
  const { user, loggedIn } = useUserSession()
  const cookie = useCookie<boolean>('gm_onboarding_done', {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })

  // True if the user has completed or dismissed onboarding.
  const isDone = computed(() => {
    if (loggedIn.value && user.value) {
      return !!user.value.onboardingCompletedAt || !!user.value.tourDismissed
    }
    return !!cookie.value
  })

  const tourDismissed = computed(() => (loggedIn.value ? !!user.value?.tourDismissed : !!cookie.value))

  async function completeOnboarding() {
    cookie.value = true
    if (loggedIn.value) {
      await $fetch('/api/users/me', {
        method: 'PATCH',
        body: { onboardingCompletedAt: new Date().toISOString() },
      }).catch(() => {})
    }
  }

  async function dismissTour() {
    cookie.value = true
    if (loggedIn.value) {
      await $fetch('/api/users/me', {
        method: 'PATCH',
        body: { tourDismissed: true },
      }).catch(() => {})
    }
  }

  async function resetOnboarding() {
    cookie.value = false
    if (loggedIn.value) {
      await $fetch('/api/users/me', {
        method: 'PATCH',
        body: { onboardingCompletedAt: null, tourDismissed: false },
      }).catch(() => {})
    }
  }

  return { isDone, tourDismissed, completeOnboarding, dismissTour, resetOnboarding }
}
