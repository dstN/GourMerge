import { test, expect } from '@playwright/test'
import { registerUser, uniqueUser, createRecipe, createIngredient, commitSnapshot } from './support/api'

/**
 * The recipe header's action cluster: every control has a name, and every control works.
 *
 * Both assertions exist because both failed after the cluster was collapsed to icons, and
 * neither was visible to any other gate:
 *
 * - The star kept its **count** as a label, so it looked labelled and was not: a count is
 *   information, not a name for a control. It shipped with no `title` and no `aria-label`
 *   while its four neighbours had both, which is the exact failure mode of icon-only
 *   buttons and the reason DESIGNBOOK §2 requires the attribute.
 * - "Diskussion" was `<UButton to="#discussion">`, and clicking it did nothing at all.
 *   `UButton` with a `to` renders a `ULink`, which auto-localises through `$localePath`; a
 *   bare hash is not a route, so there was nothing to resolve. And the browser's own hash
 *   scroll would not have helped either — `<main>` is the only scroll container in this
 *   shell (DESIGNBOOK §4.1), so a window-level scroll has nothing to move.
 *
 * axe does not catch the first (an accessible name from the count text is *a* name) and
 * nothing catches the second, because a link that resolves to nowhere is not an error.
 */
async function publishedRecipe(request: import('@playwright/test').APIRequestContext) {
  const user = uniqueUser('actions')
  await registerUser(request, user)
  const recipe = await createRecipe(request, { title: 'Action Check', visibility: 'public' })
  const flour = await createIngredient(request, 'Mehl, Weizen, hell')
  await commitSnapshot(request, recipe.id, recipe.branchId, {
    message: 'base',
    ingredients: [{ ingredientId: flour, quantity: '100', unit: 'g', notes: null, sortOrder: 0 }],
    steps: [{ sortOrder: 1, content: 'Backen.', contentTranslations: {} }],
  })
  return { user, recipe }
}

test('every icon action carries a name, and the discussion jump scrolls', async ({ page }) => {
  const request = page.context().request
  const { user, recipe } = await publishedRecipe(request)

  await page.goto('/auth/login', { waitUntil: 'load' })
  await page.evaluate(async (u) => {
    await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email, password: u.password }),
    })
  }, user)

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`/${recipe.owner.username}/${recipe.slug}`, { waitUntil: 'load' })
  await page.waitForTimeout(800)

  const cluster = page.locator('[data-tour="tour-pointers"]')

  // Every interactive control in the cluster, named. `title` for a pointer user and
  // `aria-label` for everyone else — an icon with neither is an unlabelled button.
  const named = await cluster.locator('a, button').evaluateAll((els) =>
    els.map((el) => ({
      title: el.getAttribute('title'),
      aria: el.getAttribute('aria-label'),
      text: (el.textContent ?? '').trim(),
    }))
  )
  // eslint-disable-next-line no-console -- the list is the point of the run
  console.log('  actions:', JSON.stringify(named.map((n) => n.title)))
  expect(named.length, 'the action cluster is empty — did the selector change?').toBeGreaterThanOrEqual(4)
  for (const n of named) {
    expect(n.title, `an action with text "${n.text}" has no title`).toBeTruthy()
    expect(n.aria, `an action with text "${n.text}" has no aria-label`).toBeTruthy()
  }

  // The star's name must describe the ACTION, not the count — and it flips with the state.
  const star = page.locator('[data-tour="star-button"]')
  const before = await star.getAttribute('aria-label')
  await star.click()
  await expect.poll(async () => star.getAttribute('aria-label'), { timeout: 8000 }).not.toBe(before)

  // The discussion jump actually moves the scroll container.
  const scrollTop = () => page.evaluate(() => document.querySelector('#main-content')!.scrollTop)
  const wasAt = await scrollTop()
  await cluster.locator('[title]').nth(2).click()
  await page.waitForTimeout(1200)
  const nowAt = await scrollTop()
  // eslint-disable-next-line no-console -- the measured numbers are the point of the run
  console.log(`  discussion jump: scrollTop ${wasAt} -> ${nowAt}`)
  expect(nowAt, 'clicking Diskussion did not scroll to the panel').toBeGreaterThan(wasAt + 100)
  await expect(page.locator('#discussion')).toBeInViewport()
})
