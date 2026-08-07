import { test, expect } from '@playwright/test'
import { registerUser, createRecipe, uniqueUser } from './support/api'

/**
 * Reported: "the onboarding tour gets stuck on step 2 — pressing 'weiter' does nothing."
 *
 * It wasn't stuck; it was silent. Four of the six steps anchor on a demo recipe
 * (`route: '@recipe'`), resolved once at tour start by `resolveTargetRecipe()`. When that
 * resolves to `null` — no public recipe from another user, and none of the viewer's own —
 * the ORIGINAL code still visited each `@recipe` step, called `waitForEl` on the CURRENT
 * page for an anchor that page never had, waited out the full 2.5s timeout, and only then
 * advanced. Up to four rounds, ten seconds, with the panel hidden and just a dimmed backdrop
 * on screen — indistinguishable from broken. `TourOverlay.showStep()` now recognises an
 * unreachable `@recipe` step immediately, and an early end (versus the user pressing
 * "Fertig" on a panel they were looking at) surfaces a toast instead of vanishing quietly.
 */
test.describe('onboarding tour', () => {
  test('with no demo recipe available, "next" ends the tour fast, with a toast', async ({ page }) => {
    // `page.context().request`, not the standalone `request` fixture: only the
    // context-bound one shares its cookie jar with `page`, which is what makes the
    // session `/auth/register` sets here visible to the `/dashboard` navigation below.
    const request = page.context().request
    await registerUser(request)
    // Deterministic, not "hope the shared DB happens to have nothing public": intercept the
    // two endpoints `resolveTargetRecipe()` reads.
    await page.route('**/api/recipes/explore*', (route) => route.fulfill({ json: { recipes: [] } }))
    await page.route('**/api/recipes', (route) => route.fulfill({ json: [] }))

    await page.goto('/dashboard', { waitUntil: 'load' })
    await page
      .waitForFunction(() => !!(document.querySelector('#__nuxt') as unknown as { __vnode?: unknown })?.__vnode, null, {
        timeout: 30_000,
      })
      .catch(() => {})
    // `OnboardingConceptIntro` greets a brand-new account with its own modal ~800ms after
    // mount, and its backdrop sits on top of the header — including the help menu below —
    // until dismissed. Its "Verstanden!" ("Got it") button calls the same `tour.start()`
    // as the help menu's "Start tour" entry, so this is not a different path to test.
    await page.getByRole('button', { name: /verstanden|got it/i }).click()

    await page.waitForURL(/\/explore/, { timeout: 8000 })
    await page.getByRole('button', { name: /weiter|next/i }).click()
    await page.waitForURL(/\/dashboard/, { timeout: 8000 })

    const before = Date.now()
    await page.getByRole('button', { name: /weiter|next/i }).click()

    // The fix: no anchor-wait for a step already known to be unreachable, so this resolves
    // near-instantly instead of after up to four rounds of a 2.5s timeout (up to 10s).
    await expect(page.getByText(/tour endet hier|tour ends here/i).first()).toBeVisible({ timeout: 3000 })
    expect(Date.now() - before).toBeLessThan(3000)

    // Gone, not just invisible — the dimmed backdrop from `TourOverlay` must not be left
    // covering the page with nothing on it to click.
    await expect(page.locator('.fixed.inset-0.bg-black\\/40')).toHaveCount(0)
  })

  test('with a demo recipe available, "next" on step 2 reaches the fork step', async ({ page, request }) => {
    // Owner setup can use the standalone `request` fixture — its cookies never need to
    // reach `page`. The viewer below is the account the test actually signs in as, so it
    // goes through `page.context().request` instead — see the note in the previous test.
    //
    // Does NOT assert on this specific recipe being the one the tour picks: `/api/recipes/
    // explore` returns whatever public recipes exist in the shared dev database, which by
    // design also has ones left behind by other specs. `resolveTargetRecipe()` is entitled to
    // pick any of them — this recipe only guarantees at least one exists, so the happy path
    // has something to resolve to at all.
    await registerUser(request, uniqueUser('tourowner'))
    await createRecipe(request, { title: 'Tour Demo Recipe', visibility: 'public' })
    await registerUser(page.context().request) // the viewer — different account, so Fork shows

    await page.goto('/dashboard', { waitUntil: 'load' })
    await page
      .waitForFunction(() => !!(document.querySelector('#__nuxt') as unknown as { __vnode?: unknown })?.__vnode, null, {
        timeout: 30_000,
      })
      .catch(() => {})
    // Same modal as the previous test — see the note there.
    await page.getByRole('button', { name: /verstanden|got it/i }).click()

    await page.waitForURL(/\/explore/, { timeout: 8000 })
    await page.getByRole('button', { name: /weiter|next/i }).click()
    await page.waitForURL(/\/dashboard/, { timeout: 8000 })
    await page.getByRole('button', { name: /weiter|next/i }).click()

    // Navigates to A demo recipe (owner/slug — the URL shape a `@recipe` step resolves to)
    // and highlights the fork button there.
    await expect(page).toHaveURL(/\/[^/]+\/[^/]+$/, { timeout: 8000 })
    await expect(page.locator('[data-tour="fork-button"].tour-highlight')).toBeVisible({ timeout: 8000 })
  })
})
