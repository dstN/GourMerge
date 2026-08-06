import { test, expect } from '@playwright/test'
import { registerUser, uniqueUser, createRecipe, createIngredient, commitSnapshot } from './support/api'

/**
 * The app shell on public recipe pages, and the open-request count.
 *
 * Recipe-scoped pages come in two kinds: `branches`/`history` are auth-gated and always
 * had the dashboard sidebar, while the recipe page, its forks list and the GourMerge
 * Request pages are public and used the plain shell unconditionally. A signed-in user
 * therefore lost the sidebar on a recipe and got it back on "Varianten" — flickering in
 * and out with no rule a user could infer. The `shell` middleware makes layout follow the
 * viewer instead of the route.
 *
 * The count is deliberately OPEN-only: a badge is a call for attention, and including
 * closed or merged requests would make it permanently non-zero and therefore meaningless.
 */
test('sidebar for signed-in viewers + open-GMR count badge', async ({ page, request }) => {
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

  // ── Anonymous: no sidebar, no count in the payload badge ─────
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  const anonSidebar = await page.locator('aside').count()
  const anonApi = await page.evaluate(async (u) => (await fetch(`/api/recipes/by-slug${u}?locale=de`)).json(), url)
  console.log('  anonymous: <aside> count =', anonSidebar, '| openGmrCount =', anonApi.openGmrCount)
  expect(anonApi.openGmrCount).toBe(1)

  // The old "Varianten" button must be gone from the header row.
  const variantenButtons = await page.getByRole('link', { name: /^Varianten$/ }).count()
  console.log('  header "Varianten" buttons (expect 0):', variantenButtons)
  expect(variantenButtons).toBe(0)

  // ── Signed in: sidebar present ───────────────────────────────
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
    const sidebars = await page.locator('aside').count()
    console.log(`  signed-in ${path.replace(url, '') || '/recipe'} → <aside> count = ${sidebars}`)
    expect(sidebars, `${path} should render the dashboard sidebar`).toBeGreaterThan(0)
  }

  // Closing the GMR must drop the badge to zero.
  await request.patch(`/api/recipes/${recipe.id}/gourmerge-requests/${gmr.id}`, { data: { status: 'closed' } })
  const afterClose = await page.evaluate(async (u) => (await fetch(`/api/recipes/by-slug${u}?locale=de`)).json(), url)
  console.log('  openGmrCount after closing:', afterClose.openGmrCount)
  expect(afterClose.openGmrCount).toBe(0)
})
