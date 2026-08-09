import { test, expect } from '@playwright/test'
import { registerUser, uniqueUser, createRecipe, createIngredient, commitSnapshot } from './support/api'

/**
 * The logo and the page content must share one left edge.
 *
 * ## What this used to test, and why it changed
 *
 * The signed-in shell carried a 256px `<aside>`. The header was centred in the *window*
 * while the content column began after the sidebar, so the two frames could never agree:
 * measured at 1600px, the content's left edge landed at 288px on the dashboard, 480px on a
 * recipe and 592px in settings, under a nav that did not move. The previous version of this
 * file pinned a `main.css` block of magic numbers (`--gm-shell-lead`, `--gm-shell-trail`)
 * that corrected for it from `lg` up.
 *
 * The sidebar is gone. Header and content are the same `max-w-7xl` container centred in the
 * same viewport, so alignment is structural, holds at every width, and needs no CSS. This
 * spec now asserts that directly — the logo's left edge against the content's — which is
 * both a stronger claim and the one a person actually looks at.
 *
 * Assertions are relative, never absolute pixels, so a cap or breakpoint change fails
 * loudly instead of drifting.
 */

/**
 * Logo, content column and the header's trailing control, in viewport coordinates.
 *
 * The shell's **padding box** is measured, not its border box: `<CommonPageShell>` and the
 * header's container carry the same `px-4 sm:px-6 lg:px-8` gutters, so their border boxes
 * coincide while the things a person actually sees — the logo glyph and the first word of
 * the content — sit one gutter inside. Comparing border boxes to the logo is off by exactly
 * that gutter (32px at `lg`) and would fail against a layout that is correct.
 */
const probe = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const header = document.querySelector('header')!
    const main = document.querySelector('#main-content')!
    const shell = main.querySelector('.page-shell') as HTMLElement
    const logo = header.querySelector('a') as HTMLElement
    const controls = ([...header.querySelectorAll('button, a')] as HTMLElement[]).filter(
      (el) => el.getBoundingClientRect().width > 0
    )
    const last = controls[controls.length - 1]!
    const s = shell.getBoundingClientRect()
    const cs = getComputedStyle(shell)
    return {
      contentLeft: Math.round(s.left + parseFloat(cs.paddingLeft)),
      contentRight: Math.round(s.right - parseFloat(cs.paddingRight)),
      logoLeft: Math.round(logo.getBoundingClientRect().left),
      headerTrailing: Math.round(last.getBoundingClientRect().right),
    }
  })

test.describe('logo / content alignment', () => {
  test('signed in: the logo sits directly above the content, on every page', async ({ page, request }) => {
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

    await page.setViewportSize({ width: 1600, height: 900 })

    /**
     * `wide` pages only. A `content` (4xl) or `form` (2xl) page is *deliberately* narrower
     * and centred — that is the design, not a misalignment — so only the pages that share
     * the header's own `max-w-7xl` cap can be asserted flush against the logo.
     */
    for (const [name, path] of [
      ['dashboard', '/dashboard'],
      ['recipes', '/recipes'],
      ['explore', '/explore'],
      ['starred', '/recipes/starred'],
      ['profile', `/${recipe.owner.username}`],
    ] as const) {
      await page.goto(path, { waitUntil: 'load' })
      await page.waitForTimeout(900)
      const m = await probe(page)
      // eslint-disable-next-line no-console -- the measured numbers are the point of the run
      console.log(`  ${name.padEnd(10)} logo=${m.logoLeft} content=${m.contentLeft} right=${m.contentRight}`)
      expect(
        Math.abs(m.contentLeft - m.logoLeft),
        `${name}: the content column does not start where the logo does`
      ).toBeLessThanOrEqual(2)
      expect(
        Math.abs(m.contentRight - m.headerTrailing),
        `${name}: the content column does not finish with the header controls`
      ).toBeLessThanOrEqual(2)
    }

    // The alignment is structural, so it must hold at every width — including the ones the
    // old magic-number media query did not cover (below `lg`).
    for (const width of [768, 1024, 1280, 1920, 2560]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/dashboard', { waitUntil: 'load' })
      await page.waitForTimeout(700)
      const m = await probe(page)
      // eslint-disable-next-line no-console -- the measured numbers are the point of the run
      console.log(`  ${String(width).padStart(4)}px  logo=${m.logoLeft}  content=${m.contentLeft}`)
      expect(Math.abs(m.contentLeft - m.logoLeft), `misaligned at ${width}px`).toBeLessThanOrEqual(2)
    }
  })

  /**
   * The header must never be wider than the window.
   *
   * The layout root is `h-dvh overflow-hidden`, so an over-wide header does **not** produce
   * a scrollbar — it is silently clipped, and the clipped end is the right-hand cluster
   * holding the account menu. Measured before the desktop breakpoint moved to `lg`: at a
   * 768px viewport the header's content wanted **949px**, so the avatar and the theme toggle
   * were simply not on screen between `md` and ~1000px, with nothing to indicate it.
   *
   * Nothing else in the suite would catch that: alignment still passes, axe sees elements
   * that are in the DOM and technically visible, and the page does not scroll. Hence an
   * explicit assertion, checked at the widths either side of the breakpoint.
   */
  test('the header never overflows the window at any width', async ({ page, request }) => {
    const user = uniqueUser('hdrfit')
    await registerUser(request, user)
    await page.goto('/auth/login', { waitUntil: 'load' })
    await page.evaluate(async (u) => {
      await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: u.email, password: u.password }),
      })
    }, user)

    for (const width of [390, 768, 900, 1023, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/dashboard', { waitUntil: 'load' })
      await page.waitForTimeout(500)
      const m = await page.evaluate(() => {
        const header = document.querySelector('header')!
        return {
          headerScroll: header.scrollWidth,
          win: window.innerWidth,
          navWidth: Math.round(document.querySelector('header nav')?.getBoundingClientRect().width ?? 0),
        }
      })
      // eslint-disable-next-line no-console -- the measured numbers are the point of the run
      console.log(`  ${String(width).padStart(4)}px  header=${m.headerScroll} win=${m.win} nav=${m.navWidth}`)
      expect(
        m.headerScroll,
        `at ${width}px the header wants ${m.headerScroll}px and would be clipped — ` +
          'a nav item was probably added; move the breakpoint or drop a label (see MainNav.vue)'
      ).toBeLessThanOrEqual(m.win)
      // And the two halves of the switch must agree: the desktop nav is present exactly
      // where the offcanvas is not.
      expect(m.navWidth > 0, `nav visibility is wrong at ${width}px`).toBe(width >= 1024)
    }
  })

  /**
   * The recipe header row must not spend its width on buttons and leave none for the name.
   *
   * Same failure as the app header, one level down and harder to see. The action cluster
   * held six `sm` buttons at a fixed 578px with `shrink-0`, while the identity line beside
   * it carried `min-w-0` — so the identity was structurally the side that gave way. At a
   * 640px viewport it was squeezed to **zero width** and disappeared; at 768px the slug was
   * fully truncated; at the full 832px content column it showed 93px of a 435px name. Six
   * buttons were legible and the name of the page was not, and nothing overflowed visibly,
   * so no existing test or axe rule had anything to report.
   *
   * The assertions are therefore about *who loses*, not about pixels: the identity is never
   * zero, the row never overflows, and once there is room to stack it gets a real share.
   */
  test('the recipe header gives the name room, not just the buttons', async ({ page, request }) => {
    const user = uniqueUser('rechdr')
    await registerUser(request, user)
    const recipe = await createRecipe(request, {
      // Deliberately long: a short slug hides this bug completely.
      title: 'Geschmorte Ochsenbacken mit Selleriepüree und Rotweinjus',
      visibility: 'public',
    })
    const flour = await createIngredient(request, 'Mehl, Weizen, hell')
    await commitSnapshot(request, recipe.id, recipe.branchId, {
      message: 'base',
      ingredients: [{ ingredientId: flour, quantity: '100', unit: 'g', notes: null, sortOrder: 0 }],
      steps: [{ sortOrder: 1, content: 'Schmoren.', contentTranslations: {} }],
    })

    await page.goto('/auth/login', { waitUntil: 'load' })
    await page.evaluate(async (u) => {
      await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: u.email, password: u.password }),
      })
    }, user)

    const url = `/${recipe.owner.username}/${recipe.slug}`
    for (const width of [390, 500, 640, 768, 900, 1024, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(url, { waitUntil: 'load' })
      await page.waitForTimeout(500)

      const m = await page.evaluate(() => {
        const cluster = document.querySelector('[data-tour="tour-pointers"]') as HTMLElement
        const row = cluster.parentElement as HTMLElement
        const ident = row.firstElementChild as HTMLElement
        const shell = document.querySelector('.page-shell') as HTMLElement
        const cs = getComputedStyle(shell)
        const inner = shell.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
        // How many lines the buttons occupy, by counting distinct top offsets.
        const buttons = [...cluster.querySelectorAll('a,button')] as HTMLElement[]
        return {
          inner: Math.round(inner),
          rowScroll: Math.round(row.scrollWidth),
          identW: Math.round(ident.getBoundingClientRect().width),
          buttonLines: new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top))).size,
          /**
           * A visible text label on an action, as opposed to a count.
           *
           * The star's number and the two trailing count badges are `UBadge`s and legitimate
           * at every width — a count is information, not a name — so this looks for a
           * `data-slot="label"` on the buttons themselves, which is what Nuxt UI renders for
           * a `label` prop and what would come back if someone re-added one.
           */
          labelsVisible: [...cluster.querySelectorAll('a,button')].some((b) =>
            [...b.querySelectorAll('span')].some(
              (s) => s.getAttribute('data-slot') === 'label' && s.textContent!.trim().length > 2
            )
          ),
        }
      })
      // eslint-disable-next-line no-console -- the measured numbers are the point of the run
      console.log(
        `  ${String(width).padStart(4)}px  inner=${m.inner} row=${m.rowScroll} identity=${m.identW} ` +
          `buttonLines=${m.buttonLines} labels=${m.labelsVisible}`
      )

      expect(m.rowScroll, `the header row overflows its column at ${width}px`).toBeLessThanOrEqual(m.inner + 1)
      expect(m.identW, `the recipe name was squeezed to nothing at ${width}px`).toBeGreaterThan(0)
      expect(
        m.identW / m.inner,
        `at ${width}px the buttons left the recipe name only ${Math.round((m.identW / m.inner) * 100)}% of the row`
      ).toBeGreaterThan(0.4)

      // Icon-only at EVERY width, so the cluster is always one line. Labelled it was
      // 578px against a reading column capped at 832px, which wrapped to two ragged rows
      // even at 2560px — a wider screen buys a `content` page nothing. See DESIGNBOOK §2.4:
      // all of them collapse together, never one icon among labelled siblings.
      expect(m.labelsVisible, `the actions must stay icon-only at ${width}px`).toBe(false)
      expect(m.buttonLines, `the action cluster wrapped to ${m.buttonLines} lines at ${width}px`).toBe(1)
    }
  })

  test('signed out: /explore is the reference, and still matches', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.goto('/explore', { waitUntil: 'load' })
    await page.waitForTimeout(900)

    const m = await probe(page)
    // eslint-disable-next-line no-console -- the measured numbers are the point of the run
    console.log('  anonymous /explore:', JSON.stringify(m))

    // This state was already correct before the sidebar was removed, and it is what the
    // signed-in shell was changed to match. If it ever drifts, the target moved.
    expect(Math.abs(m.contentLeft - m.logoLeft)).toBeLessThanOrEqual(2)

    expect(await page.locator('#main-content').getAttribute('data-shell')).toBe('public')
  })
})
