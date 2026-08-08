/**
 * Manages onboarding state for logged-in users.
 * Reads from the user session; persists to the API + a cookie fallback for
 * not-yet-authenticated visitors.
 */

declare module '#auth-utils' {
  interface User {
    onboardingCompletedAt?: string | null
    tourDismissed?: boolean
    hasFinishedTour?: boolean
    completedTours?: string[] | null
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

  /** True if the user finished the full interactive tour (all steps including fork + delete). */
  const hasFinishedTour = computed(() => {
    if (loggedIn.value && user.value) return !!user.value.hasFinishedTour
    return false
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

  /** Mark the tour as fully completed — controls system recipe visibility. */
  async function finishTour() {
    cookie.value = true
    if (loggedIn.value) {
      await $fetch('/api/users/me', {
        method: 'PATCH',
        body: { tourDismissed: true, hasFinishedTour: true },
      }).catch(() => {})
    }
  }

  async function resetOnboarding() {
    cookie.value = false
    if (loggedIn.value) {
      await $fetch('/api/users/me', {
        method: 'PATCH',
        body: { onboardingCompletedAt: null, tourDismissed: false, hasFinishedTour: false },
      }).catch(() => {})
    }
  }

  const completedTours = computed(() => {
    if (loggedIn.value && user.value && user.value.completedTours) {
      return user.value.completedTours
    }
    // Fallback to local storage for guests? For now, guests don't see sub-tours.
    return []
  })

  function hasCompletedTour(tourName: string): boolean {
    return completedTours.value.includes(tourName)
  }

  async function markTourCompleted(tourName: string) {
    if (!loggedIn.value || hasCompletedTour(tourName)) return

    // Optimistically update the session
    if (user.value) {
      user.value.completedTours = [...(user.value.completedTours || []), tourName]
    }

    await $fetch('/api/users/me', {
      method: 'PATCH',
      body: { completedTours: user.value?.completedTours || [tourName] },
    }).catch(() => {})
  }

  return {
    isDone,
    hasFinishedTour,
    tourDismissed,
    completedTours,
    completeOnboarding,
    dismissTour,
    finishTour,
    resetOnboarding,
    hasCompletedTour,
    markTourCompleted,
  }
}
