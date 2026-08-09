/**
 * Shell Middleware — give signed-in visitors the authenticated shell on public pages.
 *
 * Usage: `definePageMeta({ middleware: ['shell'] })`
 *
 * ## Why this exists
 *
 * Recipe-scoped pages come in two kinds. `branches` and `history` are auth-gated, so they
 * simply declare `layout: 'dashboard'`. The recipe page itself, its forks list and the
 * GourMerge Request pages are **public**, so they used the `default` layout
 * unconditionally — and a signed-in user therefore lost the authenticated chrome on a
 * recipe and got it back the moment they clicked "Varianten". The shell flickered in and
 * out depending on which recipe sub-page they were on, for no reason a user could infer.
 *
 * Layout follows the **viewer**, not the route. `definePageMeta({ layout: 'dashboard' })`
 * cannot express that, because page meta is static.
 *
 * Middleware rather than `setPageLayout()` in a component's setup: this runs before the
 * page resolves, on the server too, so the correct shell is in the first HTML response
 * instead of being swapped in after hydration.
 *
 * ## What the two shells still differ by
 *
 * Since the dashboard sidebar was removed, the visible difference is one thing: the
 * email-verification banner, which belongs to the whole authenticated shell rather than to
 * any page. That is small, and it is deliberately not a reason to merge the layouts —
 * a signed-in viewer must not miss a verification notice because they happened to be
 * reading a public page.
 */
export default defineNuxtRouteMiddleware(() => {
  const { loggedIn } = useUserSession()
  if (loggedIn.value) setPageLayout('dashboard')
})
