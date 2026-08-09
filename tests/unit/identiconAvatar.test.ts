import { describe, it, expect } from 'vitest'
import QRCode from 'qrcode'
import sharp from 'sharp'
import { renderIdenticonAvatar, qrGeometry } from '../../server/utils/identiconAvatar'

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

async function sampleModules(username: string, pixels: number) {
  const svg = await renderIdenticonAvatar({ username, origin: ORIGIN })
  const truth = QRCode.create(`${ORIGIN}/${username}`, { errorCorrectionLevel: 'M' })
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

  let mismatches = 0
  const light: number[] = []
  const dark: number[] = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const px = Math.round((origin + (c + 0.5) * module) * scale)
      const py = Math.round((origin + (r + 0.5) * module) * scale)
      const value = at(px, py)
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
    const ALLOWED = new Set([
      '#fcedd1',
      '#f6bb6a',
      '#dd7d00',
      '#381706',
      '#d7f0d9',
      '#91c985',
      '#578b35',
      '#121904',
      '#fff8ea',
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
    const svg = await renderIdenticonAvatar({ username: 'safe_user', origin: ORIGIN })
    expect(svg).not.toMatch(/<script|foreignObject|xlink:href|<image|javascript:/i)
    // The username is the one piece of caller-controlled text in the document.
    const withAngle = await renderIdenticonAvatar({ username: 'a<b>c', origin: ORIGIN })
    expect(withAngle).not.toContain('<b>')
    expect(withAngle).toContain('&#60;')
  })
})
