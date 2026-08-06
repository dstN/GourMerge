import { test, expect } from '@playwright/test'
import { registerUser, uniqueUser, createRecipe, createIngredient, commitSnapshot } from './support/api'

test.use({ viewport: { width: 1600, height: 900 } })

/**
 * One left edge inside the sidebar shell.
 *
 * `<CommonPageShell>` centres its cap, which is correct when the page is the whole
 * viewport. Beside a sidebar it is not: each page centres a *different* cap, so the left
 * edge jumped — measured at 1600px before the fix, dashboard 288px, recipe 480px, settings
 * 592px. Three starting points under the same nav.
 *
 * The caps stay (they limit line length on the right); only the centring is dropped inside
 * the shell. Asserting equality across pages rather than one magic number, so a future cap
 * change cannot quietly reintroduce the jump.
 */
test('every page in the sidebar shell shares one left edge', async ({ page, request }) => {
  const user = uniqueUser('align')
  await registerUser(request, user)
  const recipe = await createRecipe(request, { title: 'Align Check' })
  const flour = await createIngredient(request, 'Mehl, Weizen, hell')
  await commitSnapshot(request, recipe.id, recipe.branchId, {
    message: 'base',
    ingredients: [{ ingredientId: flour, quantity: '100', unit: 'g', notes: null, sortOrder: 0 }],
    steps: [{ sortOrder: 1, content: 'Base.', contentTranslations: {} }],
  })

  await page.goto('/auth/login', { waitUntil: 'load' })
  await page.evaluate(async (u) => {
    await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email, password: u.password }),
    })
  }, user)

  const edges: Array<{ name: string; left: number | null; cap: string }> = []

  for (const [name, path] of [
    ['dashboard', '/dashboard'],
    ['recipes', '/recipes'],
    ['explore', '/explore'],
    ['recipe', `/${recipe.owner.username}/${recipe.slug}`],
    ['gmr list', `/${recipe.owner.username}/${recipe.slug}/gourmerge-requests`],
    ['branches', `/${recipe.owner.username}/${recipe.slug}/branches`],
    ['settings', '/settings'],
  ] as const) {
    await page.goto(path, { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    const m = await page.evaluate(() => {
      const main = document.querySelector('#main-content')
      const shell = main?.firstElementChild as HTMLElement | null
      const mb = main?.getBoundingClientRect()
      const sb = shell?.getBoundingClientRect()
      return {
        mainLeft: mb ? Math.round(mb.left) : null,
        mainWidth: mb ? Math.round(mb.width) : null,
        shellLeft: sb ? Math.round(sb.left) : null,
        shellWidth: sb ? Math.round(sb.width) : null,
        cls:
          shell?.className
            .split(' ')
            .filter((c) => c.startsWith('max-w'))
            .join(',') ?? '',
      }
    })
    console.log(
      `  ${name.padEnd(10)} main.left=${String(m.mainLeft).padStart(4)} shell.left=${String(m.shellLeft).padStart(4)} shell.w=${String(m.shellWidth).padStart(4)} cap=${m.cls}`
    )
    edges.push({ name, left: m.shellLeft, cap: m.cls })
  }

  const distinct = [...new Set(edges.map((e) => e.left))]
  console.log('  distinct left edges:', JSON.stringify(distinct))
  expect(distinct, `pages start at different left edges: ${JSON.stringify(edges)}`).toHaveLength(1)

  // The caps must still differ — this is about alignment, not about flattening every page
  // to one width, which would give recipe prose the full width beside the sidebar.
  const caps = [...new Set(edges.map((e) => e.cap))]
  console.log('  distinct caps (should be > 1):', JSON.stringify(caps))
  expect(caps.length).toBeGreaterThan(1)
})
