/**
 * Shell Middleware — give signed-in visitors the dashboard sidebar on public pages.
 *
 * Usage: `definePageMeta({ middleware: ['shell'] })`
 *
 * ## Why this exists
 *
 * Recipe-scoped pages come in two kinds. `branches` and `history` are auth-gated, so they
 * simply declare `layout: 'dashboard'` and always have the sidebar. The recipe page itself,
 * its forks list and the GourMerge Request pages are **public**, so they used the `default`
 * layout unconditionally — which meant a signed-in user browsing a recipe lost the sidebar
 * that every other page in the app gives them, and got it back the moment they clicked
 * "Varianten". The shell flickered in and out depending on which recipe sub-page they were
 * on, for no reason a user could infer.
 *
 * Layout therefore follows the **viewer**, not the route: signed in → dashboard shell,
 * anonymous → the plain public shell. `definePageMeta({ layout: 'dashboard' })` cannot
 * express that, because page meta is static.
 *
 * Middleware rather than `setPageLayout()` in a component's setup: this runs before the
 * page resolves, on the server too, so the correct shell is in the first HTML response
 * instead of being swapped in after hydration.
 */
export default defineNuxtRouteMiddleware(() => {
  const { loggedIn } = useUserSession()
  if (loggedIn.value) setPageLayout('dashboard')
})
