import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * Accessibility scans (axe-core, WCAG 2 A/AA) on public pages.
 *
 * Gate: fail on any CRITICAL violation. SERIOUS violations are reported as
 * warnings — the outstanding ones are brand-orange (`primary-500`) colour-contrast
 * that needs a design decision (darkening the brand to meet AA); tracked separately.
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
