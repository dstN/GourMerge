import { test, expect } from '@playwright/test'
import { registerUser, uniqueUser } from './support/api'

/**
 * The desktop header navigation: identical on both layouts, and free of duplicates.
 *
 * ## Part one — one copy, not two
 *
 * `default.vue` and `dashboard.vue` each carried a hand-written copy of the nav, and the
 * copies drifted: `default.vue` was missing "Meine Rezepte", so a signed-in user lost that
 * item the moment they opened /legal/impressum and got it back on the way out, with no rule
 * they could infer. Both layouts render one component, and this test is what stops the
 * second copy coming back.
 *
 * ## Part two — one place per destination
 *
 * The nav rework removed a 256px dashboard sidebar that listed the same four destinations
 * again and two actions a third time. The rule it left behind is what the second assertion
 * block enforces: **a destination appears at most once in the header nav.** Without a test,
 * "add it to the nav too" is a one-line change nobody notices.
 *
 * Assertions are on `href`, not on the label. The browser Playwright launches asks for
 * English, so i18n redirects `/` to `/en` and renders "Explore" — a test written against
 * the German strings fails for a reason that has nothing to do with the nav. The
 * destination is also the thing that actually matters here. Hence the `$=` suffix match,
 * which holds with or without a locale prefix.
 */

/** What the header nav carries for a signed-in viewer, after the de-duplication pass. */
const SIGNED_IN_DESTINATIONS = ['/explore', '/recipes', '/recipes/starred', '/recipes/new']

/**
 * Deliberately absent from the header nav: the logo already goes to `/dashboard` for a
 * signed-in viewer and the account menu names it, so a third route to the same page is
 * exactly what this pass removed. `/settings` likewise belongs to the account menu.
 */
const NOT_IN_NAV = ['/dashboard', '/settings']

/**
 * Scoped to `header nav`, not `header`: the brand logo also points at `/dashboard` for a
 * signed-in viewer, so a header-wide match hits two elements. `href$=` rather than `href=`
 * because non-default locales are path-prefixed (`/en/explore`).
 */
const link = (href: string) => `header nav a[href$="${href}"]`

test('the header nav is identical on both layouts and lists each destination once', async ({ page, request }) => {
  const user = uniqueUser('nav')
  await registerUser(request, user)

  // Guests: the public browse link must be reachable from the desktop header, and nothing
  // auth-only may appear. `Entdecken` sitting outside the `loggedIn` guard is deliberate —
  // it is the only public browse surface, and an earlier nav hid it from guests entirely.
  await page.goto('/', { waitUntil: 'load' })
  await expect(page.locator(link('/explore'))).toBeVisible()
  await expect(page.locator(link('/recipes'))).toHaveCount(0)

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
      // `toHaveCount(1)`, not `toBeVisible()`: the point is that it is there AND that it is
      // there once. A second copy is the regression this pass exists to prevent.
      await expect(
        page.locator(link(href)),
        `${href} must appear exactly once in the header nav on ${path}`
      ).toHaveCount(1)
    }

    for (const href of NOT_IN_NAV) {
      await expect(
        page.locator(link(href)),
        `${href} belongs to the account menu, not the header nav (${path})`
      ).toHaveCount(0)
    }
  }

  // The avatar replaced the username as the account-menu trigger: a variable-width string
  // in a fixed row moved the whole control cluster by up to ~70px depending on who was
  // signed in. With no picture uploaded, the avatar is the generated QR code.
  await page.goto('/dashboard', { waitUntil: 'load' })
  const avatar = page.locator(`header img[src*="/api/users/${user.username}/avatar"]`)
  await expect(avatar, 'the header must show the generated QR avatar').toHaveCount(1)
  await expect(page.locator('header').getByText(user.username, { exact: true })).toHaveCount(0)
})

test('the generated QR avatar is a real, cacheable SVG for the profile URL', async ({ request }) => {
  const user = uniqueUser('qr')
  await registerUser(request, user)

  const res = await request.get(`/api/users/${user.username}/avatar`)
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('image/svg+xml')
  // Deterministic per username, so it is safe to cache hard — and it must be, since the
  // header renders it on every page.
  expect(res.headers()['cache-control']).toContain('immutable')

  const svg = await res.text()
  expect(svg).toContain('<svg')
  // A quiet zone is what makes it scan at all; `margin: 2` shows up as a viewBox larger
  // than the module grid. Guarding on the path being non-trivial catches an empty render.
  expect(svg.length).toBeGreaterThan(500)
  // The chef's hat is a nested <svg> element set into the middle — distinct from the
  // outer document, so this cannot pass on the identicon alone. Only against a BUILT
  // artifact does this mean anything: `getBrandMark()` reads the icon through Nitro's
  // server-assets storage, which resolves to a `Uint8Array` there and to a plain string
  // under `npm run dev`'s filesystem read — a mismatch this exact assertion caught once
  // already, silently, in production (the logo simply never rendered, no error anywhere).
  expect(svg, 'the chef’s-hat logo must be set into the middle of the code').toContain('<svg x=')

  // The charset is the same one registration enforces — this must not become a generic
  // "put arbitrary text in a QR on our domain" endpoint.
  expect((await request.get('/api/users/a/avatar')).status()).toBe(404)
  expect((await request.get('/api/users/has%20space/avatar')).status()).toBe(404)
})
