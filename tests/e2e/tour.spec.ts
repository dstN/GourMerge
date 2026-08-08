import { test, expect, type Page } from '@playwright/test'
import { registerUser, createRecipe, uniqueUser } from './support/api'

/**
 * Reported three times over: "stuck on step 2, 'weiter' does nothing" → fixed into
 * "the tour just ends where a sample recipe should be shown, that's not a fix" → fixed into
 * demo-recipe creation, and STILL "literally nothing changed, still get the no-recipe
 * message." The third report was right, and the bug was almost embarrassingly simple: the
 * `new-recipe-btn` step's "Weiter" button — the one button every visitor had just clicked
 * through five other times — still only called `tour.next()`. It never created anything; it
 * just advanced the index, and since `star-button`/`history-link`/`gourmerge-requests-link`
 * (`route: '@demo'`) had no target either, that one click cascaded silently all the way to
 * `fork-button`, landing on the exact same "no recipe available" toast as before ANY of this
 * rework — indistinguishable from it having done nothing at all, because for a visitor who
 * clicks "Weiter" out of habit (which is everyone), it hadn't.
 *
 * The fix: `new-recipe-btn` overrides the panel's next action (`TourOverlay.handleNext()`)
 * to navigate to the real `/recipes/new` form instead of advancing the tour index — so
 * "Weiter" and the highlighted "+ Neues Rezept" link now lead to the same place, and there
 * is no button on this step that skips creating a recipe short of abandoning the tour
 * entirely ("Tour überspringen"). `TourOverlay`'s `route.path` watcher picks the tour back
 * up once the visitor actually saves the form. Only `fork-button` (`route: '@recipe'`, last)
 * still needs someone ELSE's public recipe — forking your own brand-new recipe makes no
 * sense — and still degrades gracefully when none exists.
 */

/** Dismisses the welcome modal and walks through `explore-search` to land on `new-recipe-btn`. */
async function startTourAtNewRecipeStep(page: Page) {
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
}

test.describe('onboarding tour', () => {
  test('"Weiter" on new-recipe-btn leads to the real form, not past it', async ({ page }) => {
    const request = page.context().request
    await registerUser(request)
    await startTourAtNewRecipeStep(page)

    // The regression itself: this button used to just call tour.next(). Its label changes
    // on this one step (`nextLabelKey`) precisely because its ACTION changes too.
    await page.getByRole('button', { name: /rezept erstellen|create recipe/i }).click()
    await expect(page).toHaveURL(/\/recipes\/new\?tour=1/, { timeout: 8000 })

    // Not a dead end either: the tour overlay gets out of the way (`suspended`) so the real
    // form underneath is actually usable, not buried under the dimmed backdrop.
    await expect(page.locator('.fixed.inset-0.bg-black\\/40')).toHaveCount(0)
    await expect(page.getByLabel(/titel|title/i)).toBeVisible()
  })

  test('creates a recipe together with the visitor, then deletes it once the tour ends', async ({ page }) => {
    const request = page.context().request
    await registerUser(request)
    // Scoped to this test only: forces fork-button (the one step still needing someone
    // ELSE's public recipe) to be unreachable regardless of what the shared dev DB holds,
    // so the assertions below don't depend on it — this test is about the demo recipe, not
    // about fork resolution (covered by the next test).
    await page.route('**/api/recipes/explore*', (route) => route.fulfill({ json: { recipes: [] } }))
    await startTourAtNewRecipeStep(page)

    await page.getByRole('button', { name: /rezept erstellen|create recipe/i }).click()
    await page.waitForURL(/\/recipes\/new\?tour=1/, { timeout: 8000 })
    // The panel/backdrop sit in a `<Transition>` with a 200ms CSS fade, so `suspended`
    // flipping true doesn't remove them from the DOM instantly — waiting this out (rather
    // than proceeding immediately) is what keeps the next line's "Rezept erstellen" query
    // from matching both the fading-out panel button and the form's real submit button.
    await expect(page.locator('.fixed.inset-0.bg-black\\/40')).toHaveCount(0)

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

    // fork-button is last and, with `explore` mocked empty, unreachable — the same early-end
    // toast the ORIGINAL bug report described, but now only reachable via a real recipe
    // having carried the three steps before it, not as a stand-in for the whole tour.
    await page.getByRole('button', { name: /weiter|next/i }).click()
    await expect(page.getByText(/tour endet hier|tour ends here/i).first()).toBeVisible({ timeout: 3000 })

    // The recipe carried the last three steps and is gone now — deleted, not just hidden.
    await expect
      .poll(async () => (await request.get(`/api/recipes/by-slug/${demoUsername}/${demoSlug}`)).status(), {
        timeout: 8000,
      })
      .toBe(404)
  })

  test('with someone else’s public recipe available, the tour reaches the fork step', async ({ page, request }) => {
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
    await startTourAtNewRecipeStep(page)

    await page.getByRole('button', { name: /rezept erstellen|create recipe/i }).click()
    await page.waitForURL(/\/recipes\/new\?tour=1/, { timeout: 8000 })
    // See the note in the previous test — waits out the panel's leave-transition before
    // the form is touched, so the submit click below can't race it.
    await expect(page.locator('.fixed.inset-0.bg-black\\/40')).toHaveCount(0)
    await page.getByLabel(/titel|title/i).fill('Tour Fork Path Recipe')
    await page.getByRole('button', { name: /rezept erstellen|create recipe/i }).click()
    await page.waitForURL(/\/[^/]+\/[^/]+\/edit$/, { timeout: 8000 })

    await expect(page.locator('[data-tour="star-button"].tour-highlight')).toBeVisible({ timeout: 8000 })
    await page.getByRole('button', { name: /weiter|next/i }).click() // history-link
    await page.getByRole('button', { name: /weiter|next/i }).click() // gourmerge-requests-link
    await page.getByRole('button', { name: /weiter|next/i }).click() // -> fork-button

    // Navigates to the other owner's recipe (owner/slug — the URL shape a `@recipe` step
    // resolves to) and highlights the fork button there.
    await expect(page).toHaveURL(/\/[^/]+\/[^/]+$/, { timeout: 8000 })
    await expect(page.locator('[data-tour="fork-button"].tour-highlight')).toBeVisible({ timeout: 8000 })
  })
})
