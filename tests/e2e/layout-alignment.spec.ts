import { test, expect } from '@playwright/test'
import { registerUser, uniqueUser, createRecipe, createIngredient, commitSnapshot } from './support/api'

test.use({ viewport: { width: 1600, height: 900 } })

/**
 * One content column inside the sidebar shell.
 *
 * Each page declares its own cap (`wide` 7xl, `content` 4xl, `form` 2xl) and centres it.
 * In the full-viewport public layout that is right. Beside the sidebar it gave three
 * different left edges — measured at 1600px: dashboard 288, recipe 480, settings 592 — so
 * content jumped sideways under a nav that did not move.
 *
 * Left-aligning them fixed the edge and broke the spacing: a 4xl page then left ~450px of
 * dead room on the right. The gap between sidebar and content is what makes the shell look
 * deliberate, and that gap comes *from* centring — so centring stays and the cap, the thing
 * that actually varied, is unified.
 *
 * Asserted relatively, not against magic numbers: equal edges, equal widths, and left gap
 * ≈ right gap. A future cap change therefore cannot quietly reintroduce either fault.
 */
test('the sidebar shell renders one centred content column', async ({ page, request }) => {
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

  const edges: Array<{
    name: string
    left: number | null
    width: number | null
    gapL: number | null
    gapR: number | null
    cap: string
  }> = []

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
        // Gap to the sidebar and to the far edge — the breathing room, measured.
        gapLeft: mb && sb ? Math.round(sb.left - mb.left) : null,
        gapRight: mb && sb ? Math.round(mb.right - sb.right) : null,
        cls:
          shell?.className
            .split(' ')
            .filter((c) => c.startsWith('max-w'))
            .join(',') ?? '',
      }
    })
    console.log(
      `  ${name.padEnd(10)} left=${String(m.shellLeft).padStart(4)} w=${String(m.shellWidth).padStart(4)} gapL=${String(m.gapLeft).padStart(3)} gapR=${String(m.gapRight).padStart(3)} declared=${m.cls}`
    )
    edges.push({ name, left: m.shellLeft, width: m.shellWidth, gapL: m.gapLeft, gapR: m.gapRight, cap: m.cls })
  }

  const distinctLeft = [...new Set(edges.map((e) => e.left))]
  const distinctWidth = [...new Set(edges.map((e) => e.width))]
  console.log('  distinct left edges:', JSON.stringify(distinctLeft))
  console.log('  distinct widths:   ', JSON.stringify(distinctWidth))

  // One left edge AND one width: the shell has a single content column.
  expect(distinctLeft, `pages start at different left edges: ${JSON.stringify(edges)}`).toHaveLength(1)
  expect(distinctWidth, `pages render at different widths: ${JSON.stringify(edges)}`).toHaveLength(1)

  // Centred, so the gap to the sidebar is matched on the right — that breathing room is
  // the point, and left-aligning removed it in favour of one big void on the right.
  for (const e of edges) {
    expect(Math.abs(e.gapL! - e.gapR!), `${e.name} is not centred`).toBeLessThan(8)
    expect(e.gapL!, `${e.name} sits too close to the sidebar`).toBeGreaterThan(60)
  }
})
