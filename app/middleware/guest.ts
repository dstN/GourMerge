/**
 * Guest Middleware — Redirects authenticated users away from auth pages
 *
 * Usage: definePageMeta({ middleware: 'guest' })
 */
export default defineNuxtRouteMiddleware(() => {
  const { loggedIn } = useUserSession()

  if (loggedIn.value) {
    return navigateTo('/dashboard')
  }
})
