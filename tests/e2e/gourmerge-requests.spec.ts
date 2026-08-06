import { test, expect } from '@playwright/test'
import { registerUser, uniqueUser, createRecipe, createIngredient, commitSnapshot } from './support/api'

/**
 * Opening a GourMerge Request from the list.
 *
 * The row was `<UCard :to="…">`, and UCard declares no `to` prop — it takes `as`, `title`,
 * `description`, `variant`, `class`, `ui`. The attribute fell through to a plain <div>, so
 * nothing navigated while `cursor-pointer` and a hover border made every row look
 * clickable. A request could be listed and never opened, so it could never be merged or
 * closed either. Asserting the row is a real anchor is the point: a click handler on a div
 * would pass a "does it navigate" test while still being unreachable by keyboard.
 */
test('an open GourMerge Request can be opened from the list', async ({ page, request }) => {
  const user = uniqueUser('nav')
  await registerUser(request, user)
  const recipe = await createRecipe(request, { title: 'GMR Nav Check' })
  const flour = await createIngredient(request, 'Mehl, Weizen, hell')
  await commitSnapshot(request, recipe.id, recipe.branchId, {
    message: 'base',
    ingredients: [{ ingredientId: flour, quantity: '100', unit: 'g', notes: null, sortOrder: 0 }],
    steps: [{ sortOrder: 1, content: 'Base.', contentTranslations: {} }],
  })
  const feat = await (
    await request.post(`/api/recipes/${recipe.id}/branches`, { data: { name: 'feat', fromBranchId: recipe.branchId } })
  ).json()
  await commitSnapshot(request, recipe.id, feat.id, {
    message: 'change',
    ingredients: [{ ingredientId: flour, quantity: '200', unit: 'g', notes: null, sortOrder: 0 }],
    steps: [{ sortOrder: 1, content: 'Changed.', contentTranslations: {} }],
  })
  const gmr = await (
    await request.post(`/api/recipes/${recipe.id}/gourmerge-requests`, {
      data: { title: 'Doppelte Mehlmenge', sourceBranchId: feat.id, targetBranchId: recipe.branchId },
    })
  ).json()

  await page.goto(`/${recipe.owner.username}/${recipe.slug}/gourmerge-requests`, { waitUntil: 'load' })
  await expect(page.getByText('Doppelte Mehlmenge')).toBeVisible({ timeout: 20_000 })

  // It must be a real anchor, not a div that only looks clickable.
  const row = page.getByRole('link', { name: /Doppelte Mehlmenge/ }).first()
  console.log('  row is a link:', (await row.count()) > 0)
  expect(await row.count(), 'the list row must be an anchor').toBeGreaterThan(0)
  console.log('  href:', await row.getAttribute('href'))

  await row.click()
  await page.waitForURL(new RegExp(`/gourmerge-requests/${gmr.id}$`), { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: /Doppelte Mehlmenge/ })).toBeVisible({ timeout: 20_000 })
  console.log('  navigated to:', page.url())
})
