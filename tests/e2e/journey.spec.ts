import { test, expect } from '@playwright/test'
import { resetRateLimits } from './support/db'
import { registerUser, createRecipe, createIngredient, commitSnapshot, uniqueUser } from './support/api'

test.describe.configure({ mode: 'serial' })
test.beforeEach(async () => {
  await resetRateLimits()
})

test('a committed recipe renders on its public detail page (SSR + sanitized steps)', async ({ request, page }) => {
  const owner = await registerUser(request)
  const recipe = await createRecipe(request, { title: 'E2E Render Cake', visibility: 'public' })
  const flour = await createIngredient(request, `Flour ${Date.now()}`)
  await commitSnapshot(request, recipe.id, recipe.branchId, {
    message: 'first',
    ingredients: [{ ingredientId: flour, quantity: '250', unit: 'g', sortOrder: 0, notes: null }],
    steps: [{ sortOrder: 1, content: '<p>Mix and bake at 180°C.</p>', contentTranslations: null }],
  })

  await page.goto(`/${owner.username}/${recipe.slug}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'E2E Render Cake' })).toBeVisible()
  await expect(page.getByText('Mix and bake at 180')).toBeVisible()
})

test('register via the UI lands on the dashboard', async ({ page }) => {
  const user = uniqueUser('ui')
  await page.goto('/auth/register', { waitUntil: 'load' })
  // Wait for Vue hydration so @submit.prevent is attached (else the form does a
  // native GET submit). The mount node gets a __vnode once Vue has hydrated.
  await page
    .waitForFunction(() => !!(document.querySelector('#__nuxt') as unknown as { __vnode?: unknown })?.__vnode, null, {
      timeout: 30_000,
    })
    .catch(() => {})

  await page.getByRole('textbox', { name: /username|benutzername/i }).fill(user.username)
  await page.getByRole('textbox', { name: /e-?mail/i }).fill(user.email)
  await page.locator('input[type="password"]').first().fill(user.password)
  await page.getByRole('button', { name: /create account|konto erstellen|registrieren/i }).click()

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })
})
