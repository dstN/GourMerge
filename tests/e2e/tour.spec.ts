import { test, expect, type Page } from '@playwright/test'
import { registerUser, createRecipe, uniqueUser } from './support/api'

/**
 * Reported four times over: "stuck on step 2, 'weiter' does nothing" → fixed into "the tour
 * just ends where a sample recipe should be shown, that's not a fix" → fixed into demo-recipe
 * creation → "literally nothing changed, still get the no-recipe message" (the panel's own
 * "Weiter" button still just called `tour.next()` without creating anything) → fixed into
 * `TourOverlay.handleNext()` sending "Weiter" through the real form too → "even after creating
 * the recipe" the same toast, AND "you didn't fix the recipe creation process, still have to
 * go through it without help."
 *
 * That last report was right, and it was a real design gap, not a data-availability one like
 * the toast wording: `suspended` hid the ENTIRE tour overlay — panel included — the moment the
 * visitor reached `/recipes/new`, so they could interact with the real form, but also got zero
 * guidance while doing it. "The tour creates a recipe together with the user" cannot mean
 * "the tour vanishes at the door."
 *
 * The actual fix: `recipe-form-title` is now a real step, anchored on the title field of the
 * REAL `/recipes/new` form, `hideNext: true` (no "Weiter" to skip past it — only "Zurück" and
 * abandoning the tour outright stay available), with the backdrop made click-through
 * (`backdropInteractive`) so the rest of the form is still usable underneath. Two paths lead
 * there — the panel's "Weiter" on `new-recipe-btn` (plain `tour.next()` now; `recipe-form-
 * title`'s own route IS `/recipes/new`) and the highlighted "+ Neues Rezept" link clicked
 * directly, which bypasses `tour.next()` entirely — so a second `route.path` watcher advances
 * the step for the second path too. `recipes/new.vue` reads `tour.active` directly (not a
 * `?tour=1` query, which would only have been present on ONE of those two paths) to default
 * visibility to private. `TourOverlay`'s other `route.path` watcher then picks the tour back
 * up once the visitor actually submits the form, same as before. Only `fork-button`
 * (`route: '@recipe'`, always last) still needs someone ELSE's public recipe — forking your
 * own brand-new recipe makes no sense — and degrades gracefully (a distinct, positive
 * `tour.finishedNoFork` toast, not the generic early-end one) when none exists, which is the
 * production-realistic case right after publishing itself was fixed.
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

/** Walks through `recipe-form-title`, filling and submitting the real form. */
async function createDemoRecipe(page: Page, title: string) {
  await page.getByLabel(/titel|title/i).waitFor({ timeout: 8000 })
  await expect(page.locator('[data-tour="recipe-form-title"].tour-highlight')).toBeVisible({ timeout: 8000 })
  // hideNext: true — there is no "Weiter" to accidentally click past this step with.
  await expect(page.getByRole('button', { name: /weiter|next/i })).toHaveCount(0)

  await page.getByLabel(/titel|title/i).fill(title)
  await page.locator('[data-tour="recipe-form-submit"]').click()
  await page.waitForURL(/\/[^/]+\/[^/]+\/edit$/, { timeout: 8000 })
  return new URL(page.url()).pathname.split('/').slice(1, 3)
}

test.describe('onboarding tour', () => {
  test('"Weiter" on new-recipe-btn leads to a GUIDED form, not a silent one', async ({ page }) => {
    const request = page.context().request
    await registerUser(request)
    await startTourAtNewRecipeStep(page)

    await page.getByRole('button', { name: /weiter|next/i }).click()
    await expect(page).toHaveURL(/\/recipes\/new$/, { timeout: 8000 })

    // Not a dead end, and not silent either: the backdrop lets clicks through to the real
    // form (`backdropInteractive`), but the panel itself stays up, anchored to the title
    // field, actually guiding the visitor rather than vanishing at the door.
    await expect(page.locator('[data-tour="recipe-form-title"].tour-highlight')).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('button', { name: /weiter|next/i })).toHaveCount(0)
    await page.getByLabel(/titel|title/i).fill('should be typeable')
    await expect(page.getByLabel(/titel|title/i)).toHaveValue('should be typeable')
  })

  test('clicking the highlighted link directly reaches the same guided step', async ({ page }) => {
    // The regression: this path bypasses tour.next() entirely (it's a plain link click),
    // so without TourOverlay's second route watcher the tour's step index would stay on
    // new-recipe-btn while the visitor is already looking at the form.
    const request = page.context().request
    await registerUser(request)
    await startTourAtNewRecipeStep(page)

    await page.locator('[data-tour="new-recipe-btn"]').click()
    await expect(page).toHaveURL(/\/recipes\/new$/, { timeout: 8000 })
    await expect(page.locator('[data-tour="recipe-form-title"].tour-highlight')).toBeVisible({ timeout: 8000 })
    // The backdrop must not still be blocking the form underneath.
    await page.getByLabel(/titel|title/i).fill('reachable')
    await expect(page.getByLabel(/titel|title/i)).toHaveValue('reachable')
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

    await page.getByRole('button', { name: /weiter|next/i }).click()
    const [demoUsername, demoSlug] = await createDemoRecipe(page, 'Tour Onboarding Recipe')

    // Resumes on its own — no extra click — on the recipe just created, view page (not
    // edit), with star-button highlighted.
    await expect(page).toHaveURL(new RegExp(`/${demoUsername}/${demoSlug}$`), { timeout: 8000 })
    await expect(page.locator('[data-tour="star-button"].tour-highlight')).toBeVisible({ timeout: 8000 })

    await page.getByRole('button', { name: /weiter|next/i }).click()
    await expect(page.locator('[data-tour="history-link"].tour-highlight')).toBeVisible({ timeout: 8000 })

    await page.getByRole('button', { name: /weiter|next/i }).click()
    await expect(page.locator('[data-tour="gourmerge-requests-link"].tour-highlight')).toBeVisible({ timeout: 8000 })

    // fork-button is last and, with `explore` mocked empty, unreachable — but everything
    // before it just succeeded, so this ends on the positive "tour complete, fork just
    // needs someone else's recipe" toast, not the generic early-end one. Distinguishing the
    // two is the point: showing identical wording for "nothing worked" and "everything
    // worked except the one step that structurally can't demo on your own recipe" is what
    // made this fix read as having changed nothing when it was first reported back.
    await page.getByRole('button', { name: /weiter|next/i }).click()
    await expect(page.getByText(/tour abgeschlossen|tour complete/i).first()).toBeVisible({ timeout: 3000 })

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

    await page.getByRole('button', { name: /weiter|next/i }).click()
    await createDemoRecipe(page, 'Tour Fork Path Recipe')

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
