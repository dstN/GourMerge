import { test, expect, type Page } from '@playwright/test'
import { registerUser, createRecipe, uniqueUser } from './support/api'

// `recipe-form-title` anchors on the real /recipes/new form's title field (hideNext, click-through
// backdrop via backdropInteractive) so the tour guides actual recipe creation instead of vanishing
// at the door. Reachable via the panel's "Weiter" or the highlighted link directly — both advance
// the step through route watchers in TourOverlay.
//
// Forking is NOT part of this continuous flow — it is its own sub-tour (`FORK_TOUR`,
// `tour.start('fork')`), launched the first time the visitor clicks "Remix" on ANY recipe
// that isn't their own, and always demos on the hidden `system` account's recipe rather than
// the one actually clicked (`forkRecipe()` in the recipe page). `db:seed:tour` creates that
// account and recipe; the E2E workflow runs it before this suite.

/** A raw `page.goto` outruns Vue's hydration — the DOM is there but no `@click` is wired up
 *  yet, so a click on it does nothing. `startTourAtNewRecipeStep` already waits for this on
 *  `/dashboard`; anything else navigated to directly (not via a SPA link click) needs it too. */
async function waitForHydration(page: Page) {
  await page
    .waitForFunction(() => !!(document.querySelector('#__nuxt') as unknown as { __vnode?: unknown })?.__vnode, null, {
      timeout: 30_000,
    })
    .catch(() => {})
}

/** Dismisses the welcome modal and walks through `explore-search` to land on `new-recipe-btn`. */
async function startTourAtNewRecipeStep(page: Page) {
  await page.goto('/dashboard', { waitUntil: 'load' })
  await waitForHydration(page)
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

/**
 * `createDemoRecipe` lands on `/edit` with the tour already advanced to `add-ingredient`
 * (the route watcher in `TourOverlay` does that). `add-ingredient` / `add-step` /
 * `commit-button` are optional-interaction steps — highlighted, but not `hideNext`, so
 * "Weiter" moves past them without actually adding anything itself; the watcher in
 * `edit.vue` types a demo ingredient/step in on the visitor's behalf regardless of whether
 * they click through fast or slow. `view-recipe-btn` IS `hideNext: true`: there is no
 * "Weiter" to skip it with, so reaching the view page takes a real click on the real link,
 * exactly like `recipe-form-title` needed a real form submit.
 *
 * That real click does NOT trip the unsaved-changes prompt: `edit.vue` re-baselines
 * `isDirty` right after typing the demo content in, so "dirty" means changed since the tour
 * handed the page over, not changed since the empty page first loaded.
 */
async function walkEditorToViewPage(page: Page) {
  await expect(page.locator('[data-tour="add-ingredient"].tour-highlight')).toBeVisible({ timeout: 8000 })
  // The demo ingredient types in character by character (edit.vue's tour-automation
  // watcher); clicking through before it finishes races its own re-baseline of `isDirty`,
  // briefly seeing genuinely-in-progress typing as unsaved. A real visitor reading the
  // panel takes longer than the ~1s this runs for, so waiting for the finished value
  // matches that rather than working around a raced one.
  await expect(page.locator('[data-tour="ingredient-section"] input').first()).toHaveValue('Apfel', {
    timeout: 5000,
  })
  await page.getByRole('button', { name: /weiter|next/i }).click() // -> add-step

  await expect(page.getByText('Den Apfel in kleine Stücke schneiden.')).toBeVisible({ timeout: 5000 })
  await page.getByRole('button', { name: /weiter|next/i }).click() // -> commit-button
  await page.getByRole('button', { name: /weiter|next/i }).click() // -> view-recipe-btn

  await expect(page.locator('[data-tour="view-recipe-btn"].tour-highlight')).toBeVisible({ timeout: 8000 })
  await expect(page.getByRole('button', { name: /weiter|next/i })).toHaveCount(0)
  await page.locator('[data-tour="view-recipe-btn"]').click()
  // The regression this guards: the demo ingredient/step used to leave `isDirty` true
  // against the pre-tour empty baseline, so this exact click used to raise the
  // unsaved-changes modal instead of navigating — proven below by the caller's own
  // assertion that this actually lands on the view page.
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
    await startTourAtNewRecipeStep(page)

    await page.getByRole('button', { name: /weiter|next/i }).click()
    const [demoUsername, demoSlug] = await createDemoRecipe(page, 'Tour Onboarding Recipe')
    await walkEditorToViewPage(page)

    // The real "View recipe" click lands here — view page, not edit — with star-button
    // highlighted next.
    await expect(page).toHaveURL(new RegExp(`/${demoUsername}/${demoSlug}$`), { timeout: 8000 })
    await expect(page.locator('[data-tour="star-button"].tour-highlight')).toBeVisible({ timeout: 8000 })

    await page.getByRole('button', { name: /weiter|next/i }).click()
    await expect(page.locator('[data-tour="favorites-nav"].tour-highlight')).toBeVisible({ timeout: 8000 })

    await page.getByRole('button', { name: /weiter|next/i }).click()
    await expect(page.locator('[data-tour="tour-pointers"].tour-highlight')).toBeVisible({ timeout: 8000 })

    // edit-recipe-btn is `hideNext: true` too — a real click back onto /edit.
    await page.getByRole('button', { name: /weiter|next/i }).click()
    await expect(page.locator('[data-tour="edit-recipe-btn"].tour-highlight')).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('button', { name: /weiter|next/i })).toHaveCount(0)
    await page.locator('[data-tour="edit-recipe-btn"]').click()

    // delete-demo: the tour's last step, and also `hideNext: true`. Deleting for real is
    // the only way through it — there is no "Weiter" standing in for the actual action here.
    await expect(page).toHaveURL(new RegExp(`/${demoUsername}/${demoSlug}/edit$`), { timeout: 8000 })
    await expect(page.locator('[data-tour="delete-demo"].tour-highlight')).toBeVisible({ timeout: 8000 })
    await page.locator('[data-tour="delete-demo"]').click()
    // The confirmation modal's own button is exact "Delete"/"Löschen" — the trigger just
    // clicked is labelled "Delete Recipe"/"Rezept löschen", which a loose match would also
    // hit.
    await page.getByRole('button', { name: /^(löschen|delete)$/i }).click()

    // A normal finish (reaching the last step and completing it) has no toast of its own —
    // only the auto-skip endings (`finishEarly`) show one. Landing on /recipes is the signal.
    await expect(page).toHaveURL(/\/recipes$/, { timeout: 8000 })

    // The recipe carried every one of those steps and is gone now — deleted, not just hidden.
    await expect
      .poll(async () => (await request.get(`/api/recipes/by-slug/${demoUsername}/${demoSlug}`)).status(), {
        timeout: 8000,
      })
      .toBe(404)
  })

  test('the first "Remix" click on someone else’s recipe launches the guided fork tour', async ({ page, request }) => {
    // Owner setup can use the standalone `request` fixture — its cookies never need to
    // reach `page`. The viewer below is the account the test actually signs in as, so it
    // goes through `page.context().request` instead — see the note in the previous test.
    await registerUser(request, uniqueUser('tourowner'))
    const otherRecipe = await createRecipe(request, { title: 'Tour Demo Recipe', visibility: 'public' })
    await registerUser(page.context().request) // the viewer — different account, so Fork shows
    await startTourAtNewRecipeStep(page)

    await page.getByRole('button', { name: /weiter|next/i }).click()
    await createDemoRecipe(page, 'Tour Fork Path Recipe')
    await walkEditorToViewPage(page)
    await expect(page.locator('[data-tour="star-button"].tour-highlight')).toBeVisible({ timeout: 8000 })

    // Forking is not the next "Weiter" step from here — it is its own sub-tour, launched by
    // a real "Remix" click on a recipe that isn't the visitor's own. Navigating straight to
    // it rather than through Explore + a title search: the shared dev database also carries
    // "Tour Demo Recipe" entries left behind by other runs of this same spec, so a text
    // search is not guaranteed to resolve to exactly one link.
    await page.goto(`/${otherRecipe.owner.username}/${otherRecipe.slug}`)
    await waitForHydration(page)
    await page.locator('[data-tour="fork-button"]').click()

    // Redirects to the hidden `system` account's recipe — the fork tour always demos on
    // that one, never on the recipe actually clicked (see `forkRecipe()`).
    await expect(page).toHaveURL(/\/system\/[^/]+$/, { timeout: 8000 })
    await expect(page.locator('[data-tour="fork-button"].tour-highlight')).toBeVisible({ timeout: 8000 })
  })
})
