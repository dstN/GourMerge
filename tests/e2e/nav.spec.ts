import { test, expect } from '@playwright/test'
import { registerUser, uniqueUser } from './support/api'

/**
 * The desktop header navigation must not depend on which layout a page happens to use.
 *
 * It did: `default.vue` and `dashboard.vue` each carried their own hand-written copy of the
 * nav, and the copies had drifted — `default.vue` was missing "Meine Rezepte". A signed-in
 * user lost that item the moment they opened /legal/impressum and got it back on the way
 * out, with no rule they could infer. Both layouts now render one component, and this test
 * is what stops the second copy from coming back: it checks the same four destinations on a
 * dashboard-layout page and on a default-layout page.
 *
 * Assertions are on `href`, not on the label. The browser Playwright launches asks for
 * English, so i18n redirects `/` to `/en` and renders "Explore" — a test written against
 * the German strings fails for a reason that has nothing to do with the nav. The
 * destination is also the thing that actually matters here. Hence the `$=` suffix match,
 * which holds with or without a locale prefix.
 */
const SIGNED_IN_DESTINATIONS = ['/dashboard', '/recipes', '/explore', '/recipes/new']

/**
 * Scoped to `header nav`, not `header`: the brand logo also points at `/dashboard` for a
 * signed-in viewer, so a header-wide match hits two elements and fails on strictness.
 * `href$=` rather than `href=` because non-default locales are path-prefixed (`/en/explore`).
 */
const link = (href: string) => `header nav a[href$="${href}"]`

test('the header nav is identical on both layouts', async ({ page, request }) => {
  const user = uniqueUser('nav')
  await registerUser(request, user)

  // Guests: the public browse link must be reachable from the desktop header, and nothing
  // auth-only may appear. `Entdecken` sitting outside the `loggedIn` guard is deliberate —
  // it is the only public browse surface, and an earlier nav hid it from guests entirely.
  await page.goto('/', { waitUntil: 'load' })
  await expect(page.locator(link('/explore'))).toBeVisible()
  await expect(page.locator(link('/dashboard'))).toHaveCount(0)

  await page.goto('/auth/login', { waitUntil: 'load' })
  await page.evaluate(async (u) => {
    await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email, password: u.password }),
    })
  }, user)

  // `/dashboard` uses the dashboard layout, `/legal/impressum` the default one — the two
  // that had drifted. `/explore` is in the list because it is the one page both a guest and
  // a signed-in user land on, so a regression shows there first.
  for (const path of ['/dashboard', '/explore', '/legal/impressum']) {
    await page.goto(path, { waitUntil: 'load' })
    for (const href of SIGNED_IN_DESTINATIONS) {
      await expect(page.locator(link(href)), `${href} missing from the header on ${path}`).toBeVisible()
    }
  }
})
