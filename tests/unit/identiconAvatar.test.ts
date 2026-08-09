import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import QRCode from 'qrcode'
import sharp from 'sharp'
import { renderIdenticonAvatar, qrGeometry, parseBrandMark } from '../../server/utils/identiconAvatar'

/**
 * The real brand mark, read from the same file the endpoint serves it from — so this
 * exercises the actual artwork rather than a fixture that can drift away from it.
 */
// `process.cwd()`, not `import.meta.url`: under happy-dom `import.meta.url` is an http URL
// and `readFileSync` rejects it. Vitest runs from the repo root.
const LOGO = parseBrandMark(readFileSync(resolve(process.cwd(), 'public/icon.svg'), 'utf8'))

/**
 * The fallback avatar has one requirement that is not a matter of taste: **it must still
 * scan**. Everything in the renderer that makes it look like a badge rather than a barcode
 * — round dots instead of blocks, rounded finder eyes, an identicon frame eating into the
 * tile — spends some of a decoder's tolerance, and none of it is safe by inspection.
 *
 * So this rasterises the real SVG at the sizes the app actually renders it, binarises the
 * pixels the way a decoder does, samples the centre of every module, and compares the
 * result against the matrix `qrcode` produced. A style change that quietly drops modules
 * fails here instead of failing on somebody's phone.
 *
 * It is not a full decode — that would mean adding a decoder dependency for one test — but
 * it checks the property a decode depends on: every module reads back as the bit it is
 * supposed to be, with enough contrast to binarise.
 */

const ORIGIN = 'https://gourmerge.de'

/** Luma, the same channel weighting a binarising decoder uses. */
const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b

/**
 * Rasterise at the target size by rewriting the SVG's own `width`/`height`, **not** by
 * `.resize()`.
 *
 * `sharp(svg).resize(192)` renders the document at its declared 100×100 and then upscales
 * the bitmap — so every module is sampled at ~2px and blurred back up, and the test reports
 * failures the browser would never produce. That cost an hour and two "fixes" to the
 * renderer before the artefact was spotted, which is why it is written down here.
 */
async function rasterise(svg: string, pixels: number) {
  const sized = svg.replace(/width="\d+" height="\d+"/, `width="${pixels}" height="${pixels}"`)
  return sharp(Buffer.from(sized)).raw().toBuffer({ resolveWithObject: true })
}

/**
 * @param withLogo when true, the badge carries the centre mark — which raises the error
 *   correction to `H` and deliberately destroys the modules under it. Those are reported
 *   separately as `covered`; `mismatches` counts only modules that should have survived.
 */
async function sampleModules(username: string, pixels: number, withLogo = false) {
  const logo = withLogo ? LOGO : null
  const svg = await renderIdenticonAvatar({ username, origin: ORIGIN, logo })
  const truth = QRCode.create(`${ORIGIN}/${username}`, { errorCorrectionLevel: withLogo ? 'H' : 'M' })
  const n = truth.modules.size
  const { tile, origin, module } = qrGeometry(n)

  const { data, info } = await rasterise(svg, pixels)

  const scale = pixels / tile
  const at = (px: number, py: number) => {
    const i =
      (Math.min(info.height - 1, Math.max(0, py)) * info.width + Math.min(info.width - 1, Math.max(0, px))) *
      info.channels
    return luma(data[i]!, data[i + 1]!, data[i + 2]!)
  }

  // Mirrors `LOGO_FRACTION` and the pad in the renderer, with a module of slack, so the
  // knockout's own footprint is attributed to the logo rather than reported as damage.
  const span = n * module
  const size = withLogo ? span * 0.24 : 0
  const lo = origin + (span - size) / 2 - module * 1.6
  const hi = origin + (span + size) / 2 + module * 1.6

  let mismatches = 0
  let covered = 0
  const light: number[] = []
  const dark: number[] = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const ux = origin + (c + 0.5) * module
      const uy = origin + (r + 0.5) * module
      if (withLogo && ux > lo && ux < hi && uy > lo && uy < hi) {
        covered++
        continue
      }
      const value = at(Math.round(ux * scale), Math.round(uy * scale))
      const expected = truth.modules.data[r * n + c] === 1
      ;(expected ? dark : light).push(value)
      // 128 is the midpoint a naive binariser uses; real ones adapt, so passing at the
      // naive threshold is the stronger claim.
      if (value < 128 !== expected) mismatches++
    }
  }

  return {
    n,
    mismatches,
    covered,
    total: n * n,
    maxDark: Math.max(...dark),
    minLight: Math.min(...light),
  }
}

describe('identicon avatar — machine readability', () => {
  /**
   * 192px is `<CommonUserAvatar size="2xl">`, the size the profile page renders and the
   * one place the badge is meant to be scanned. Every module must be exact there — this is
   * the assertion the whole design was tuned against, and it is what a change to the
   * identicon band, the plate padding or the dot radius will break first.
   */
  it('every module reads back correctly at the scanning size (192px)', async () => {
    for (const username of ['gourmerge_user', 'ab_cd', 'margin_check', 'a_very_long_username_here']) {
      const { mismatches, total, n } = await sampleModules(username, 192)
      expect(n).toBeGreaterThanOrEqual(21)
      expect(mismatches, `${username}: ${mismatches}/${total} modules binarise to the wrong value`).toBe(0)
    }
  })

  /**
   * The 50-character maximum a username may be is the one case 192px does not render
   * exactly: the URL needs a 37×37 symbol, so a module is 3.4px and three of 1369 land on
   * an antialiased edge. Recorded rather than hidden — it is well inside `M`'s 15%
   * recovery, and it is exact one size up. Nobody registers a 50-character name, but the
   * schema allows it and a limit that is not measured is a limit nobody knows about.
   */
  it('a maximum-length username stays readable at 192px and is exact at 256px', async () => {
    const longest = 'x'.repeat(50)
    const small = await sampleModules(longest, 192)
    expect(small.mismatches / small.total).toBeLessThan(0.01)
    expect((await sampleModules(longest, 256)).mismatches).toBe(0)
  })

  it('stays exact as it gets larger', async () => {
    for (const px of [256, 384]) {
      const { mismatches, total } = await sampleModules('gourmerge_user', px)
      expect(mismatches, `@${px}px: ${mismatches}/${total} modules wrong`).toBe(0)
    }
  })

  /**
   * Below the scanning size the badge is an identity mark, not a scanning target — so this
   * asserts a budget rather than perfection. The budget is the code's own error correction:
   * `M` recovers 15% of the codewords, and staying under 2% of modules keeps a real read
   * comfortably inside it if someone does try.
   */
  it('degrades within the error-correction budget at avatar sizes (160px)', async () => {
    for (const username of ['ab_cd', 'margin_check', 'gourmerge_user']) {
      const { mismatches, total } = await sampleModules(username, 160)
      expect(mismatches / total, `${username}: ${mismatches}/${total} modules wrong`).toBeLessThan(0.02)
    }
  })

  /**
   * The centre logo is the only thing here that damages the symbol on purpose, so the size
   * of that damage is the number worth pinning — and the two claims either side of it.
   *
   * `covered` is a deliberate **over-estimate**: the box excludes the knockout (24% of the
   * width, ~5.8% of the area), plus the plate pad around it, plus a module of measurement
   * slack, so the true damage is smaller than the figure asserted. `H` reconstructs 30% of
   * the codewords, so even the over-estimate leaves better than half the budget unspent.
   *
   * **The two sizes are not arbitrary.** `H` grows the symbol — 37 modules where `M` needed
   * 29 — so each one is smaller at the same box. 256 device pixels is where the render is
   * exact, and that is the number that describes reality: the profile badge is a 192 CSS-px
   * box, and a phone held up to a screen is looking at its *device* pixels, so any display
   * at 2× or better renders it at 384+. 192 is therefore the 1×-display worst case, and it
   * is allowed a fraction of a percent of antialiasing noise — three modules of 1369, against
   * the 30% of codewords `H` reconstructs.
   */
  it('the centre logo destroys only a small, budgeted share of the symbol', async () => {
    expect(LOGO, 'public/icon.svg did not parse — the badge would silently lose its logo').not.toBeNull()

    for (const username of ['gourmerge_user', 'ab_cd', 'a_very_long_username_here']) {
      const { mismatches, covered, total, n } = await sampleModules(username, 256, true)
      // eslint-disable-next-line no-console -- the measured numbers are the point of the run
      console.log(`  ${username}: n=${n} covered≤${covered}/${total} (${((covered / total) * 100).toFixed(1)}%)`)
      expect(covered, `${username}: the logo covered nothing — is it being drawn?`).toBeGreaterThan(0)
      expect(covered / total, `${username}: the logo eats ${covered}/${total} modules`).toBeLessThan(0.15)
      expect(mismatches, `${username}: ${mismatches} modules outside the logo read wrongly at 256px`).toBe(0)

      /**
       * The 1×-display worst case, budgeted rather than required to be perfect.
       *
       * Measured: 0 wrong for a 33-module symbol, 19 of 1681 (**1.1%**) for the densest one
       * a 25-character username produces. `H` reconstructs 30% of the codewords, so 1.1% of
       * modules blurring at the threshold is deep inside the budget — and it only happens on
       * a 1× display, which a phone camera pointed at a screen almost never is. 2% is the
       * line: past that something structural has changed, not antialiasing.
       */
      const small = await sampleModules(username, 192, true)
      expect(
        small.mismatches / small.total,
        `${username}: ${small.mismatches}/${small.total} modules wrong at 192px`
      ).toBeLessThan(0.02)
    }
  })

  it('keeps a wide binarisation margin rather than only just clearing the threshold', async () => {
    // A decoder picks its own threshold from the local histogram. A gap this wide means it
    // lands correctly wherever it puts it; a marginal one would pass the tests above and
    // still fail on a phone under warm light.
    const { maxDark, minLight } = await sampleModules('margin_check', 192)
    expect(maxDark, 'a dark module sampled too light').toBeLessThan(110)
    expect(minLight, 'a light module sampled too dark').toBeGreaterThan(150)
  })

  it('leaves the quiet zone clear on all four sides', async () => {
    const username = 'quiet_zone'
    const svg = await renderIdenticonAvatar({ username, origin: ORIGIN })
    const n = QRCode.create(`${ORIGIN}/${username}`, { errorCorrectionLevel: 'M' }).modules.size
    const { tile, origin, module } = qrGeometry(n)

    const px = 256
    const { data, info } = await rasterise(svg, px)
    const scale = px / tile
    const at = (x: number, y: number) => {
      const i = (Math.round(y) * info.width + Math.round(x)) * info.channels
      return luma(data[i]!, data[i + 1]!, data[i + 2]!)
    }

    // One module out from the matrix on every side must still be plate-light. Without this
    // band the identicon frame would be crowding the symbol and decoders start failing.
    for (let k = 0; k < n; k++) {
      const along = (origin + (k + 0.5) * module) * scale
      const before = (origin - 0.5 * module) * scale
      const after = (origin + (n + 0.5) * module) * scale
      for (const [x, y] of [
        [along, before],
        [along, after],
        [before, along],
        [after, along],
      ] as const) {
        expect(at(x, y), `quiet zone contaminated at module ${k}`).toBeGreaterThan(180)
      }
    }
  })
})

describe('identicon avatar — identity and safety', () => {
  it('is deterministic: the same username always renders the same bytes', async () => {
    const a = await renderIdenticonAvatar({ username: 'stable', origin: ORIGIN })
    const b = await renderIdenticonAvatar({ username: 'stable', origin: ORIGIN })
    expect(a).toBe(b)
  })

  it('derives the frame case-insensitively, so one account has one mark', async () => {
    // The seed lower-cases the name. Only the *frame* is compared: the QR still encodes the
    // caller's own spelling, because that is the URL they asked for.
    const frameOf = (svg: string) => svg.slice(svg.indexOf('<rect width'), svg.indexOf('<rect x="11.1'))
    expect(frameOf(await renderIdenticonAvatar({ username: 'Stable', origin: ORIGIN }))).toBe(
      frameOf(await renderIdenticonAvatar({ username: 'stable', origin: ORIGIN }))
    )
  })

  it('gives visibly different frames to similar usernames', async () => {
    const frame = (svg: string) => svg.slice(svg.indexOf('<rect width'), svg.indexOf('<rect x="11.1'))
    const [a, b, c] = await Promise.all([
      renderIdenticonAvatar({ username: 'anna', origin: ORIGIN }),
      renderIdenticonAvatar({ username: 'anna1', origin: ORIGIN }),
      renderIdenticonAvatar({ username: 'annb', origin: ORIGIN }),
    ])
    // SHA-256 of the name, not a cheap string hash, is what makes neighbours diverge.
    expect(frame(a)).not.toBe(frame(b))
    expect(frame(a)).not.toBe(frame(c))
  })

  it('stays inside the two brand ramps — no per-user hue', async () => {
    // DESIGNBOOK §1.3: individuality comes from geometry, not from inventing a palette.
    // Every value here is a `--color-{primary,secondary}-*` token from main.css.
    const ALLOWED = new Set([
      '#fcedd1', // primary-100  wash
      '#f6bb6a', // primary-300  soft
      '#dd7d00', // primary-500  accent
      '#7e3a06', // primary-800  ink
      '#fff8ea', // primary-50   plate
      '#d7f0d9', // secondary-100
      '#91c985', // secondary-300
      '#578b35', // secondary-500
      '#3a5713', // secondary-700
    ])
    for (const username of ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']) {
      const svg = await renderIdenticonAvatar({ username, origin: ORIGIN })
      for (const hex of svg.match(/#[0-9a-f]{6}/g) ?? []) {
        expect(ALLOWED.has(hex), `${username} used an off-palette colour ${hex}`).toBe(true)
      }
    }
  })

  it('the small `mark` variant drops the QR entirely rather than shrinking it', async () => {
    const mark = await renderIdenticonAvatar({ username: 'small_user', origin: ORIGIN, variant: 'mark' })
    const badge = await renderIdenticonAvatar({ username: 'small_user', origin: ORIGIN })
    // The badge's ink is the QR; a mark that still carried one would be the noise this
    // variant exists to avoid. Same seed, so the ramp must match — one identity, two views.
    expect(mark).not.toContain('#381706')
    expect(mark).not.toContain('#121904')
    expect(mark.length).toBeLessThan(badge.length / 4)
    const rampOf = (svg: string) => /<rect width="100" height="100" fill="(#[0-9a-f]{6})"/.exec(svg)?.[1]
    expect(rampOf(mark)).toBe(rampOf(badge))
  })

  it('the mark is deterministic and stays on-palette', async () => {
    const ALLOWED = new Set(['#fcedd1', '#f6bb6a', '#dd7d00', '#d7f0d9', '#91c985', '#578b35'])
    for (const username of ['one', 'two', 'three', 'four']) {
      const svg = await renderIdenticonAvatar({ username, origin: ORIGIN, variant: 'mark' })
      expect(svg).toBe(await renderIdenticonAvatar({ username, origin: ORIGIN, variant: 'mark' }))
      for (const hex of svg.match(/#[0-9a-f]{6}/g) ?? []) {
        expect(ALLOWED.has(hex), `${username}: off-palette ${hex} in the mark`).toBe(true)
      }
    }
  })

  it('emits only shapes — no script, no external reference, no foreignObject', async () => {
    // With the logo too: it is the one part assembled from a file on disk rather than from
    // shapes this module generates, so it is the one that could smuggle something in.
    const svg = await renderIdenticonAvatar({ username: 'safe_user', origin: ORIGIN, logo: LOGO })
    expect(svg).not.toMatch(/<script|foreignObject|xlink:href|<image|javascript:|on[a-z]+=/i)
    // The username is the one piece of caller-controlled text in the document.
    const withAngle = await renderIdenticonAvatar({ username: 'a<b>c', origin: ORIGIN })
    expect(withAngle).not.toContain('<b>')
    expect(withAngle).toContain('&#60;')
  })
})
