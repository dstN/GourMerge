import { test, expect, type Page } from '@playwright/test'
import { registerUser, createRecipe, uniqueUser } from './support/api'

// `recipe-form-title` anchors on the real /recipes/new form's title field (hideNext, click-through
// backdrop via backdropInteractive) so the tour guides actual recipe creation instead of vanishing
// at the door. Reachable via the panel's "Weiter" or the highlighted link directly — both advance
// the step through route watchers in TourOverlay. `fork-button` (always last) needs someone else's
// public recipe and shows a distinct "tour complete, nothing to fork yet" toast when none exists.

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

    // fork-button unreachable here (explore mocked empty) is expected — everything before it
    // succeeded, so this is the positive "tour complete, fork needs another recipe" toast.
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
