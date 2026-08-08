import { test, expect } from '@playwright/test'
import { registerUser, createRecipe, uniqueUser } from './support/api'

/**
 * Reported, twice: "the onboarding tour gets stuck on step 2 — pressing 'weiter' does
 * nothing," and then, after the first fix, "the tour just ends where a sample recipe
 * should be shown — that's not a fix." Both were true. Four of the six steps anchor on a
 * recipe (originally `route: '@recipe'` for all of them, resolved once at tour start by
 * `resolveTargetRecipe()`); when nothing resolved, the tour either hung on a 2.5s
 * `waitForEl` timeout per step (first bug) or, once that was fixed, silently gave up and
 * showed a "nothing to demo" toast (second complaint) — technically not stuck, but also not
 * actually onboarding anyone.
 *
 * The real fix: the `new-recipe-btn` step now sends the visitor through the REAL
 * `/recipes/new` form (see `TourOverlay`'s `suspended` + its `route.path` watcher) instead
 * of searching for something pre-existing, so `star-button`/`history-link`/
 * `gourmerge-requests-link` (`route: '@demo'`) always have something to point at once the
 * visitor creates it. Only `fork-button` (`route: '@recipe'`, now last) still needs someone
 * ELSE's public recipe — forking your own brand-new recipe makes no sense — and still
 * degrades gracefully (skip, or the toast on last-step) when the shared dev DB has none.
 * `useProductTour.cleanupDemoRecipe()` deletes the created recipe on every tour exit
 * (finish or skip), so onboarding does not leave demo debris behind.
 */
test.describe('onboarding tour', () => {
  test('with no demo recipe and nobody else public, "next" ends the tour fast, with a toast', async ({ page }) => {
    // `page.context().request`, not the standalone `request` fixture: only the
    // context-bound one shares its cookie jar with `page`, which is what makes the
    // session `/auth/register` sets here visible to the `/dashboard` navigation below.
    const request = page.context().request
    await registerUser(request)
    // Deterministic, not "hope the shared DB happens to have nothing public": intercept the
    // endpoint `resolveOtherRecipe()` reads. No recipe gets created in this test either
    // (the visitor only ever presses "Weiter"), so every `@demo` step is equally unreachable.
    await page.route('**/api/recipes/explore*', (route) => route.fulfill({ json: { recipes: [] } }))

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

    // The fix: no anchor-wait for a step already known to be unreachable, so this cascades
    // through star/history/gmr/fork (all target-less) and resolves near-instantly, rather
    // than after up to four rounds of a 2.5s timeout (up to 10s).
    await expect(page.getByText(/tour endet hier|tour ends here/i).first()).toBeVisible({ timeout: 3000 })
    expect(Date.now() - before).toBeLessThan(3000)

    // Gone, not just invisible — the dimmed backdrop from `TourOverlay` must not be left
    // covering the page with nothing on it to click.
    await expect(page.locator('.fixed.inset-0.bg-black\\/40')).toHaveCount(0)
  })

  test('with someone else’s public recipe available, "next" past new-recipe-btn eventually reaches the fork step', async ({
    page,
    request,
  }) => {
    // Owner setup can use the standalone `request` fixture — its cookies never need to
    // reach `page`. The viewer below is the account the test actually signs in as, so it
    // goes through `page.context().request` instead — see the note in the previous test.
    //
    // Does NOT assert on this specific recipe being the one the tour picks: `/api/recipes/
    // explore` returns whatever public recipes exist in the shared dev database, which by
    // design also has ones left behind by other specs. `resolveOtherRecipe()` is entitled to
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
    // Skips past `new-recipe-btn` without creating anything, same as any visitor who just
    // wants to look around first — star/history/gmr (`@demo`) silently skip in turn since
    // nothing was created, landing on fork-button (`@recipe`, now the last step).
    await page.getByRole('button', { name: /weiter|next/i }).click()

    // Navigates to the other owner's recipe (owner/slug — the URL shape a `@recipe` step
    // resolves to) and highlights the fork button there.
    await expect(page).toHaveURL(/\/[^/]+\/[^/]+$/, { timeout: 8000 })
    await expect(page.locator('[data-tour="fork-button"].tour-highlight')).toBeVisible({ timeout: 8000 })
  })

  test('creates a recipe together with the visitor, then deletes it once the tour ends', async ({ page }) => {
    const request = page.context().request
    await registerUser(request)
    // Scoped to this test only: forces fork-button (the one step still needing someone
    // ELSE's public recipe) to be unreachable regardless of what the shared dev DB holds,
    // so the assertions below don't depend on it — this test is about the demo recipe, not
    // about fork resolution (covered by the previous test).
    await page.route('**/api/recipes/explore*', (route) => route.fulfill({ json: { recipes: [] } }))

    await page.goto('/dashboard', { waitUntil: 'load' })
    await page
      .waitForFunction(() => !!(document.querySelector('#__nuxt') as unknown as { __vnode?: unknown })?.__vnode, null, {
        timeout: 30_000,
      })
      .catch(() => {})
    await page.getByRole('button', { name: /verstanden|got it/i }).click()

    await page.waitForURL(/\/explore/, { timeout: 8000 })
    await page.getByRole('button', { name: /weiter|next/i }).click()
    await page.waitForURL(/\/dashboard/, { timeout: 8000 })

    // The create-together path: follow the REAL "+ Neues Rezept" link instead of "Weiter".
    // The `data-tour` anchor specifically — "Neues Rezept" also appears in the header,
    // sidebar and mobile menu. `tour.active` is what puts `?tour=1` on this one (dashboard.vue).
    await page.locator('[data-tour="new-recipe-btn"]').click()
    await page.waitForURL(/\/recipes\/new\?tour=1/, { timeout: 8000 })

    await page.getByLabel(/titel|title/i).fill('Tour Onboarding Recipe')
    await page.getByRole('button', { name: /rezept erstellen|create recipe/i }).click()

    // The form's own success redirect is what `TourOverlay`'s watcher is waiting for.
    await page.waitForURL(/\/[^/]+\/[^/]+\/edit$/, { timeout: 8000 })
    const [demoUsername, demoSlug] = new URL(page.url()).pathname.split('/').slice(1, 3)

    // Resumes on its own — no extra click — on the recipe just created, view page (not
    // edit), with star-button highlighted.
    await expect(page).toHaveURL(new RegExp(`/${demoUsername}/${demoSlug}$`), { timeout: 8000 })
    await expect(page.locator('[data-tour="star-button"].tour-highlight')).toBeVisible({ timeout: 8000 })

    await page.getByRole('button', { name: /weiter|next/i }).click()
    await expect(page.locator('[data-tour="history-link"].tour-highlight')).toBeVisible({ timeout: 8000 })

    await page.getByRole('button', { name: /weiter|next/i }).click()
    await expect(page.locator('[data-tour="gourmerge-requests-link"].tour-highlight')).toBeVisible({ timeout: 8000 })

    // fork-button is last and, with `explore` mocked empty, unreachable — same early-end
    // toast as the first test, which is what triggers `finish()` → `cleanupDemoRecipe()`.
    await page.getByRole('button', { name: /weiter|next/i }).click()
    await expect(page.getByText(/tour endet hier|tour ends here/i).first()).toBeVisible({ timeout: 3000 })

    // The recipe carried the last three steps and is gone now — deleted, not just hidden.
    await expect
      .poll(async () => (await request.get(`/api/recipes/by-slug/${demoUsername}/${demoSlug}`)).status(), {
        timeout: 8000,
      })
      .toBe(404)
  })
})
