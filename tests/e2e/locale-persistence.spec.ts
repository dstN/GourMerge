import { test, expect } from '@playwright/test'

/**
 * Reported: choose another language, browse, click the logo — and the site is German again.
 *
 * The logo's target is a runtime expression (`loggedIn ? '/dashboard' : '/'`). i18n localises a
 * NuxtLink whose `to` is a static literal, but it cannot rewrite a ternary evaluated at runtime,
 * so the link pointed at the UNPREFIXED path — which under `prefix_except_default` is the
 * default locale. `localePath()` fixes it; this asserts the href AND the navigation, because a
 * correct href that redirects anyway would still be the reported bug.
 */

test('the logo keeps the chosen locale', async ({ page }) => {
  await page.goto('/fr/explore', { waitUntil: 'load' })
  const href = await page.locator('header a').first().getAttribute('href')
  console.log('logo href on /fr/explore:', href)
  expect(href).toMatch(/^\/fr(\/|$)/)
  await page.locator('header a').first().click()
  await page.waitForLoadState('load')
  console.log('after click:', new URL(page.url()).pathname)
  expect(new URL(page.url()).pathname).toMatch(/^\/fr(\/|$)/)
})
