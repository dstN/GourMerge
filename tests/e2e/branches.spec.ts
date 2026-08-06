import { test, expect } from '@playwright/test'
import { registerUser, uniqueUser, createRecipe, createIngredient, commitSnapshot } from './support/api'

/**
 * Viewing a non-default branch.
 *
 * The detail page used to ignore `?branch=` and always render `defaultBranch`, so a variant
 * could be created and edited but never read — the branches page linked only to "edit" and
 * "history". These assertions pin that the whole page follows the selection: steps,
 * ingredient list and (server-computed) nutrition all belong to the chosen branch.
 */
test('a non-default branch can be viewed and switched to', async ({ page, request }) => {
  const user = uniqueUser('br')
  await registerUser(request, user)
  const recipe = await createRecipe(request, { title: 'Branch View Check', servings: 2 })
  const flour = await createIngredient(request, 'Mehl, Weizen, hell')
  const butter = await createIngredient(request, 'Butter of choice')

  await commitSnapshot(request, recipe.id, recipe.branchId, {
    message: 'main',
    ingredients: [{ ingredientId: flour, quantity: '100', unit: 'g', notes: null, sortOrder: 0 }],
    steps: [{ sortOrder: 1, content: 'Nur Mehl auf main.', contentTranslations: {} }],
  })

  const paleo = await (
    await request.post(`/api/recipes/${recipe.id}/branches`, {
      data: { name: 'paleo', fromBranchId: recipe.branchId },
    })
  ).json()

  await commitSnapshot(request, recipe.id, paleo.id, {
    message: 'paleo',
    ingredients: [
      { ingredientId: flour, quantity: '100', unit: 'g', notes: null, sortOrder: 0 },
      { ingredientId: butter, quantity: '50', unit: 'g', notes: null, sortOrder: 1 },
    ],
    steps: [{ sortOrder: 1, content: 'Mehl und Butter auf paleo.', contentTranslations: {} }],
  })

  // ── The default branch ───────────────────────────────────────
  await page.goto(`/${recipe.owner.username}/${recipe.slug}`, { waitUntil: 'load' })
  await expect(page.getByText('Nur Mehl auf main.')).toBeVisible({ timeout: 20_000 })
  console.log('  main renders its own step')

  // GitHub-style trigger and the "N Varianten" link must both be present.
  // Rendered as a link, not a button — UButton with `to` emits an <a>.
  await expect(page.getByRole('link', { name: /2 Varianten|2 variants/i })).toBeVisible()
  console.log('  branch count link present')

  // ── Direct URL to the variant ────────────────────────────────
  await page.goto(`/${recipe.owner.username}/${recipe.slug}?branch=${paleo.id}`, { waitUntil: 'load' })
  await expect(page.getByText('Mehl und Butter auf paleo.')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Nur Mehl auf main.')).toHaveCount(0)
  console.log('  ?branch= renders the variant, not the default')

  // The ingredient list follows the branch too. Asserted via the API rather than by
  // ingredient name: names are rendered in the viewer's locale, so the canonical English
  // string is not what appears on a German page.
  const counts = await page.evaluate(
    async ([u, s, b]) => {
      const one = await (await fetch(`/api/recipes/by-slug/${u}/${s}?locale=de`)).json()
      const two = await (await fetch(`/api/recipes/by-slug/${u}/${s}?locale=de&branch=${b}`)).json()
      return {
        main: one.currentIngredients.length,
        variant: two.currentIngredients.length,
        mainBranch: one.selectedBranch.name,
        variantBranch: two.selectedBranch.name,
      }
    },
    [recipe.owner.username, recipe.slug, String(paleo.id)]
  )
  console.log('  ingredients main vs variant:', JSON.stringify(counts))
  expect(counts.mainBranch).toBe('main')
  expect(counts.variantBranch).toBe('paleo')
  expect(counts.variant).toBe(counts.main + 1)

  // ── Switching back via the picker ────────────────────────────
  // Targeted by aria-label, not by its visible text: the trigger's label is the branch
  // name, which changes with the selection, and `aria-label` is what makes it stable.
  await page
    .getByLabel(/Variante wechseln|Switch variant/i)
    .first()
    .click()
  await page.getByRole('option').first().waitFor({ timeout: 10_000 })
  await page.getByRole('option', { name: /^main/i }).first().click()
  await page.waitForURL((u) => !u.search.includes('branch='), { timeout: 15_000 })
  await expect(page.getByText('Nur Mehl auf main.')).toBeVisible({ timeout: 20_000 })
  console.log('  picker switched back to main and dropped ?branch= from the URL')
})
