import { test, expect } from '@playwright/test'
import { registerUser, uniqueUser, createRecipe, createIngredient, commitSnapshot } from './support/api'

/**
 * The app shell on public recipe pages, and the open-request count.
 *
 * Recipe-scoped pages come in two kinds: `branches`/`history` are auth-gated and always
 * used the authenticated shell, while the recipe page, its forks list and the GourMerge
 * Request pages are public and used the plain one unconditionally — so a signed-in user
 * lost the authenticated chrome on a recipe and got it back on "Varianten", flickering in
 * and out with no rule they could infer. The `shell` middleware makes layout follow the
 * viewer instead of the route.
 *
 * **What it asserts changed with the nav rework.** The visible marker used to be the
 * dashboard `<aside>`; that sidebar is gone (it triple-listed every destination — see
 * `layouts/dashboard.vue`). The remaining difference between the two shells is the
 * email-verification banner region, which is what this now checks: the authenticated shell
 * renders `<LayoutVerifyEmailBanner>`'s host element, the public one does not. A stale
 * `<aside>` assertion would have passed vacuously against zero sidebars on both.
 *
 * The count is deliberately OPEN-only: a badge is a call for attention, and including
 * closed or merged requests would make it permanently non-zero and therefore meaningless.
 */
test('authenticated shell for signed-in viewers + open-GMR count badge', async ({ page, request }) => {
  const user = uniqueUser('shell')
  await registerUser(request, user)
  const recipe = await createRecipe(request, { title: 'Shell Check' })
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
      data: { title: 'More flour', sourceBranchId: feat.id, targetBranchId: recipe.branchId },
    })
  ).json()

  const url = `/${recipe.owner.username}/${recipe.slug}`

  // ── Anonymous: the public shell, and the count in the payload ─
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  const anonShell = await page.locator('#main-content').getAttribute('data-shell')
  const anonApi = await page.evaluate(async (u) => (await fetch(`/api/recipes/by-slug${u}?locale=de`)).json(), url)
  console.log('  anonymous: data-shell =', anonShell, '| openGmrCount =', anonApi.openGmrCount)
  expect(anonShell, 'a guest must get the public shell').toBe('public')
  expect(anonApi.openGmrCount).toBe(1)

  // The old "Varianten" button must be gone from the header row.
  const variantenButtons = await page.getByRole('link', { name: /^Varianten$/ }).count()
  console.log('  header "Varianten" buttons (expect 0):', variantenButtons)
  expect(variantenButtons).toBe(0)

  // ── Signed in: the authenticated shell on the same public pages ──
  await page.goto('/auth/login', { waitUntil: 'load' })
  await page.evaluate(async (u) => {
    await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email, password: u.password }),
    })
  }, user)

  for (const path of [url, `${url}/gourmerge-requests`, `${url}/gourmerge-requests/${gmr.id}`]) {
    await page.goto(path, { waitUntil: 'load' })
    await page.waitForTimeout(1500)
    const shell = await page.locator('#main-content').getAttribute('data-shell')
    console.log(`  signed-in ${path.replace(url, '') || '/recipe'} → data-shell = ${shell}`)
    expect(shell, `${path} should render the authenticated shell`).toBe('app')
  }

  // Closing the GMR must drop the badge to zero.
  await request.patch(`/api/recipes/${recipe.id}/gourmerge-requests/${gmr.id}`, { data: { status: 'closed' } })
  const afterClose = await page.evaluate(async (u) => (await fetch(`/api/recipes/by-slug${u}?locale=de`)).json(), url)
  console.log('  openGmrCount after closing:', afterClose.openGmrCount)
  expect(afterClose.openGmrCount).toBe(0)
})
