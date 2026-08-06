import { test, expect } from '@playwright/test'
import { registerUser, uniqueUser, createRecipe, createIngredient, commitSnapshot } from './support/api'

/**
 * Copying the ingredient list to the clipboard.
 *
 * Asserted by reading the clipboard back, not by checking that a toast appeared: a button
 * that shows "copied" while writing nothing is the failure mode worth catching, and it is
 * exactly what a toast-only assertion would miss.
 */
test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

/**
 * Serial, and not by preference: `clipboard.writeText` only resolves for a focused
 * document, and pages in parallel workers contend for focus. Run in parallel these tests
 * fail with an empty clipboard — a property of the harness, not of the feature.
 */
test.describe.configure({ mode: 'serial' })

test('the ingredient list reaches the clipboard as a shopping list', async ({ page, request }) => {
  const user = uniqueUser('copy')
  await registerUser(request, user)
  const recipe = await createRecipe(request, { title: 'Copy Check', servings: 4 })

  const chicken = await createIngredient(request, 'Poulet, Brust, ohne Haut, roh')
  const oil = await createIngredient(request, 'Olivenöl')
  const salt = await createIngredient(request, 'Salz, Meersalz, Fleur de sel')

  await commitSnapshot(request, recipe.id, recipe.branchId, {
    message: 'base',
    ingredients: [
      { ingredientId: chicken, quantity: '650', unit: 'g', notes: 'in Streifen geschnitten', sortOrder: 0 },
      { ingredientId: oil, quantity: '2', unit: 'tbsp', notes: null, sortOrder: 1 },
      { ingredientId: salt, quantity: '1', unit: 'pinch', notes: null, sortOrder: 2 },
    ],
    steps: [{ sortOrder: 1, content: 'Anbraten.', contentTranslations: {} }],
  })

  await page.goto(`/${recipe.owner.username}/${recipe.slug}`, { waitUntil: 'load' })
  await page.locator('[data-test="copy-ingredients"]').waitFor({ timeout: 20_000 })
  // `clipboard.writeText` requires the document to be focused, and a page in a parallel
  // worker may not be — which fails the write, not the feature.
  await page.bringToFront()
  await page.locator('[data-test="copy-ingredients"]').click()

  // Poll the clipboard rather than the button label or a fixed delay: the write is async,
  // and the clipboard is what actually has to change.
  await expect
    .poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).length, { timeout: 15_000 })
    .toBeGreaterThan(0)

  // Chromium normalises line endings to CRLF on Windows, so split tolerantly instead of
  // asserting against a platform-specific separator.
  const raw = await page.evaluate(() => navigator.clipboard.readText())
  const text = raw.split(/\r\n|\r|\n/).join('\n')
  console.log(
    '  clipboard:\n' +
      text
        .split('\n')
        .map((l) => '    ' + l)
        .join('\n')
  )

  const lines = text.split('\n')
  expect(lines[0], 'starts with the recipe title').toBe('Copy Check')
  expect(lines[1], 'then the serving count').toMatch(/^4 /)
  expect(lines[2], 'blank line before the list').toBe('')

  const items = lines.filter((l) => l.startsWith('- '))
  expect(items).toHaveLength(3)
  expect(items[0]).toContain('Poulet, Brust, ohne Haut, roh')
  expect(items[0], 'notes ride along in parentheses').toContain('(in Streifen geschnitten)')
  expect(items[0], 'quantity and unit, as displayed').toMatch(/650\s*g/)

  // Order is the recipe's order, not alphabetical — a cook reads it top to bottom.
  expect(items[1]).toContain('Olivenöl')
  expect(items[2]).toContain('Salz')

  // Units are translated, not raw enum values.
  expect(text).not.toContain('tbsp')
  expect(text).not.toContain('pinch')

  // Provenance, so a pasted list can be traced back to the recipe.
  expect(lines[lines.length - 1]).toContain(`/${recipe.owner.username}/${recipe.slug}`)
})

test('no copy button when a recipe has no ingredients', async ({ page, request }) => {
  const user = uniqueUser('copyempty')
  await registerUser(request, user)
  const recipe = await createRecipe(request, { title: 'Empty Copy Check' })

  await page.goto(`/${recipe.owner.username}/${recipe.slug}`, { waitUntil: 'load' })
  await page.waitForTimeout(1500)

  // Offering an action that can only produce an empty clipboard is worse than not
  // offering it.
  await expect(page.locator('[data-test="copy-ingredients"]')).toHaveCount(0)
})
