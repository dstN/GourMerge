import { test, expect } from '@playwright/test'
import { registerUser, uniqueUser, createRecipe, createIngredient, commitSnapshot } from './support/api'

/**
 * The content column inside the sidebar shell.
 *
 * Each page declares its own cap (`wide` 7xl, `content` 4xl, `form` 2xl) and centres it,
 * which is right in the full-viewport public layout and wrong beside a sidebar: it gave
 * three different left edges — measured at 1600px, dashboard 288, recipe 480, settings 592
 * — so content jumped sideways under a nav that did not move.
 *
 * What the shell does now: one column for every page, a visible gap after the sidebar, and
 * a trailing edge that lands on the header's working area so content and chrome finish
 * together.
 *
 * **What it deliberately does NOT do** is align the leading edge with the top nav's first
 * item, which was the original request. That target moves: the header is `justify-between`
 * with three groups, so the centre group sits wherever the side groups leave it, and the
 * user menu carries the username. Measured at a fixed 1600px viewport, the first nav item
 * sits at 461px for a 5-character username and 389px for a 28-character one. There is
 * nothing stable to align to, so the leading edge is a fixed gap instead.
 *
 * Assertions are relative, never absolute pixels, so a cap or breakpoint change fails
 * loudly instead of drifting.
 */
test.describe('sidebar shell layout', () => {
  test('one column, consistent gap, trailing edge on the header', async ({ page, request }) => {
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

    /** Content column vs the sidebar and vs the header's trailing control. */
    const probe = () =>
      page.evaluate(() => {
        const header = document.querySelector('header')!
        const main = document.querySelector('#main-content')!
        const shell = main.firstElementChild as HTMLElement
        // Last *visible* control in the header — the user menu.
        const controls = ([...header.querySelectorAll('button, a')] as HTMLElement[]).filter(
          (el) => el.getBoundingClientRect().width > 0
        )
        const last = controls[controls.length - 1]!
        const s = shell.getBoundingClientRect()
        const m = main.getBoundingClientRect()
        return {
          left: Math.round(s.left),
          right: Math.round(s.right),
          gapToSidebar: Math.round(s.left - m.left),
          headerTrailing: Math.round(last.getBoundingClientRect().right),
        }
      })

    // ── One column across pages, at a representative desktop width ──
    await page.setViewportSize({ width: 1600, height: 900 })
    const rows: Array<{ name: string; left: number; right: number; gap: number }> = []

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
      await page.waitForTimeout(1000)
      const m = await probe()
      console.log(`  ${name.padEnd(10)} left=${m.left} right=${m.right} gapToSidebar=${m.gapToSidebar}`)
      rows.push({ name, left: m.left, right: m.right, gap: m.gapToSidebar })
    }

    expect([...new Set(rows.map((r) => r.left))], `differing left edges: ${JSON.stringify(rows)}`).toHaveLength(1)
    expect([...new Set(rows.map((r) => r.right))], `differing right edges: ${JSON.stringify(rows)}`).toHaveLength(1)

    // A visible gap after the sidebar. Butting up against it is the other way to get a
    // consistent edge, and it reads as a bug rather than a decision.
    for (const r of rows) expect(r.gap, `${r.name} sits too close to the sidebar`).toBeGreaterThan(60)

    // ── The trailing edge tracks the header at every width ──
    for (const width of [1280, 1600, 1920, 2560]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/dashboard', { waitUntil: 'load' })
      await page.waitForTimeout(900)
      const m = await probe()
      console.log(`  ${String(width).padStart(4)}px  content.right=${m.right}  header.trailing=${m.headerTrailing}`)
      expect(
        Math.abs(m.right - m.headerTrailing),
        `at ${width}px the content column does not finish with the header controls — if the ` +
          `header's container or padding changed, --gm-shell-trail in main.css needs updating`
      ).toBeLessThanOrEqual(2)
    }
  })

  test('the public layout still centres, untouched by the shell rule', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.goto('/explore', { waitUntil: 'load' })
    await page.waitForTimeout(1000)

    const m = await page.evaluate(() => {
      const main = document.querySelector('#main-content')
      const shell = main?.firstElementChild as HTMLElement | null
      const b = shell!.getBoundingClientRect()
      return {
        shellAttr: main?.getAttribute('data-shell'),
        left: Math.round(b.left),
        right: Math.round(window.innerWidth - b.right),
      }
    })
    console.log('  anonymous /explore:', JSON.stringify(m))

    // No sidebar → no shell attribute → the override must not apply at all.
    expect(m.shellAttr).toBeNull()
    expect(Math.abs(m.left - m.right), 'public content must stay centred').toBeLessThan(8)
  })
})
