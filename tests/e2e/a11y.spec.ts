import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { registerUser, uniqueUser, createRecipe, createIngredient, commitSnapshot } from './support/api'

/**
 * Accessibility scans (axe-core, WCAG 2 A/AA) on public pages.
 *
 * Gate: fail on any CRITICAL violation. SERIOUS violations are logged as warnings.
 *
 * As of the design-system pass there are **zero** of either. The three that used to
 * be logged and shrugged off were all real, and all fixed centrally in `main.css`:
 * brand-orange contrast (light-mode palette darkening), `text-dimmed` measuring
 * 3.74:1 on dark card surfaces, and `.link` being distinguishable by colour alone
 * inside a paragraph. Keep this list at zero — a "serious" that stays logged is a
 * defect that ships.
 */
const PUBLIC_PAGES = [
  '/',
  '/explore',
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/help/glossary',
  '/legal/impressum',
  '/legal/datenschutz',
  '/legal/contact',
]

async function audit(page: import('@playwright/test').Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.locator('#__nuxt').first().waitFor({ state: 'visible' })
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const critical = violations.filter((v) => v.impact === 'critical')
  const serious = violations.filter((v) => v.impact === 'serious')
  if (serious.length) {
    console.warn(`[a11y serious] ${path}: ${serious.map((v) => `${v.id}(${v.nodes.length})`).join(', ')}`)
  }
  expect(critical, `${path}\n` + critical.map((v) => `${v.id} — ${v.nodes.length} node(s)`).join('\n')).toEqual([])
}

for (const path of PUBLIC_PAGES) {
  test(`a11y (light): ${path}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await audit(page, path)
  })
}

test('a11y (dark): landing + explore', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await audit(page, '/')
  await audit(page, '/explore')
})

/**
 * The recipe page, in both schemes, with a discussion thread on it.
 *
 * The static list above covers marketing, auth and legal pages — none of which carry
 * user-generated content. The recipe page is the one visitors actually read, and it is
 * where the newest surfaces live: the serving-suggestion `<figure>`, the QR avatars in the
 * discussion list, and the thread markup itself. It needs data, which is why it is a
 * separate test rather than another entry in `PUBLIC_PAGES`.
 */
test('a11y: a public recipe with a discussion, light and dark', async ({ page, request }) => {
  const author = await registerUser(request, uniqueUser('a11y'))
  const recipe = await createRecipe(request, { title: 'Accessible Apple Cake', visibility: 'public' })
  const flour = await createIngredient(request, 'Mehl, Weizen, hell')
  await commitSnapshot(request, recipe.id, recipe.branchId, {
    message: 'base',
    ingredients: [{ ingredientId: flour, quantity: '250', unit: 'g', notes: 'gesiebt', sortOrder: 0 }],
    steps: [{ sortOrder: 1, content: 'Alles verrühren und backen.', contentTranslations: {} }],
  })
  await request.post(`/api/recipes/${recipe.id}/discussions`, {
    data: { title: 'Mit Dinkelmehl probiert', body: 'Wird etwas kerniger, hält aber gut zusammen.', category: 'idea' },
  })

  const url = `/${author.username}/${recipe.slug}`
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await audit(page, url)
  }
})
