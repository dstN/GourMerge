/**
 * Auth Middleware — Redirects unauthenticated users to login
 *
 * Usage: definePageMeta({ middleware: 'auth' })
 */
export default defineNuxtRouteMiddleware(() => {
  const { loggedIn } = useUserSession()

  if (!loggedIn.value) {
    return navigateTo('/auth/login')
  }
})
