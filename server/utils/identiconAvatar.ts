/**
 * The fallback avatar: an identicon badge with a scannable QR code set into it.
 *
 * A user who has not uploaded a picture gets a mark generated from their username — a
 * mirrored identicon frame around a soft-dotted QR of their profile URL. Point a phone at
 * it and it opens `https://gourmerge.de/<username>`.
 *
 * ## The composition, and why it is this one
 *
 * The obvious reading of "identicon with a QR in it" is to paint the pattern *behind* the
 * code. That cannot work: a decoder binarises the image and needs the light modules to be
 * light everywhere, so any texture under the data area either destroys the read or has to
 * be so faint it is not a pattern at all. Both outcomes are worse than not doing it.
 *
 * So the identicon is the **frame**, the QR sits on an opaque plate at the centre, and the
 * chef's hat is set into the middle of the code — an identicon with a code in it, and a code
 * with the brand in it, each half still doing its job. The frame is a genuine 9×9 mirrored
 * identicon grid laid over the whole tile whose interior the plate covers, which is why it
 * reads as one object rather than as a sticker on wallpaper.
 *
 * ## What makes it still scan
 *
 * Every one of these was arrived at by rasterising the real SVG and sampling the centre of
 * every module against the matrix `qrcode` produced (`tests/unit/identiconAvatar.test.ts`).
 * None of it is safe by inspection, and three of the five were bugs first.
 *
 * 1. **Contrast, and a polarity.** The symbol is **inverted** — the ramp's 300 on its 950,
 *    about **9.5:1**. A QR does not need to be dark-on-light, it needs the two states to
 *    binarise apart, and inverting is what lets the badge be a dark brand object instead of
 *    a pale one. It costs a small amount of decoder compatibility, which `RAMPS` states
 *    rather than hides.
 * 2. **A quiet zone.** Two modules of plate on every side, inside the plate's own padding.
 *    Decoders fail without it far more often than they fail on styling.
 * 3. **Intact finder patterns.** The eyes are rounded squares — corner radius is tolerated,
 *    losing the 1:1:3:1:1 ring is not — and no data dot is drawn in their 8×8 reserved area.
 *    The radius is bounded by geometry, not taste; see the note above `EYE_RX`.
 * 4. **Generous dots.** Radius 0.47 of a module, so adjacent dark modules nearly touch.
 *    Prettier and smaller loses ink until binarisation starts dropping modules.
 * 5. **Enough pixels per module.** This is the constraint everything else was tuned against,
 *    and the centre logo made it tighter: a logo needs error correction `H`, `H` needs a
 *    bigger symbol for the same URL (37 modules where `M` needed 29), and a bigger symbol
 *    means smaller modules at the same box.
 *
 *    Measured with the logo, the badge is exact from **256 device pixels**, with a couple of
 *    antialiased modules at 192. That is not the problem it sounds like: the profile page
 *    renders a 192 **CSS**-pixel box, and a phone held up to a screen sees its *device*
 *    pixels — so anything at 2× or better is rendering at 384+. 192 is the 1×-display worst
 *    case, and a stray module there costs a fraction of a percent against the 30% of
 *    codewords `H` reconstructs.
 *
 *    It is also why the identicon band is one cell of a **9×9** grid rather than a 7×7: the
 *    thinner frame buys ~13% module size, and that margin is what the logo then spent.
 *
 * ## Colour
 *
 * Individuality comes from **geometry**, and from picking one of the two brand ramps — not
 * from a per-user hue. A random hue per user is what GitHub does and it would make a
 * comment thread look like a bag of sweets next to a saffron-and-slate product. See
 * DESIGNBOOK §1.3.
 *
 * The hex values below are the sRGB form of the `@theme` tokens in
 * `app/assets/css/main.css` and must be kept in step with them. They are duplicated rather
 * than read because this runs on the server, where the stylesheet does not exist, and
 * emitted as hex rather than `oklch()` so the contrast a decoder sees never depends on the
 * browser's colour support. A unit test asserts no other colour is ever emitted.
 */
import { createHash } from 'node:crypto'
import QRCode from 'qrcode'

/**
 * sRGB of the `--color-{primary,secondary}-*` tokens in main.css. Keep in step.
 *
 * ## The symbol is inverted: light modules on a dark ground
 *
 * Two earlier versions were dark-on-light — first a near-black 950 (15:1, which read as a
 * barcode on sand) and then an 800 (8:1, saffron but still a pale badge). Neither looked
 * like this product next to a dark UI. The ground is now the ramp's 950 and the modules its
 * 300, measured at **9.5:1 (primary) / 9.3:1 (secondary)** — better contrast than the
 * dark-on-light version it replaces, because both ends moved.
 *
 * | modules on the 950 ground | contrast |
 * | ------------------------- | -------- |
 * | 100                       | 14.1:1   |
 * | 200                       | 12.0:1   |
 * | **300** ← chosen          | **9.5:1** |
 * | 400                       | 7.1:1    |
 * | 500                       | 5.4:1    |
 *
 * The 300 is picked over the brighter 100/200 because it is the most *saturated* shade that
 * still clears a wide margin — 14:1 would be cream again, which is the look this replaces.
 *
 * ## The caveat that comes with inverting, stated plainly
 *
 * ISO/IEC 18004 defines a symbol as dark-on-light and says readers *should* also handle
 * reflectance reversal. In practice the iOS camera, Android's ML Kit and every mainstream
 * scanner app do; a strict or very old decoder may not. That is a real, if small, narrowing
 * of what can read this badge, and it was accepted deliberately for the brand look — not
 * overlooked. If it ever needs undoing, swap `plate` and `ink` per ramp and nothing else
 * changes: the geometry, the quiet zone and the tests are all polarity-agnostic.
 */
const RAMPS = {
  primary: {
    tile: '#5b2b10', // primary-900  the badge ground
    dotSoft: '#dd7d00', // primary-500  quieter bezel dots
    dotBright: '#f6bb6a', // primary-300  louder bezel dots, and the plate hairline
    plate: '#381706', // primary-950  the code's ground — darker than the tile, so it reads inset
    ink: '#f6bb6a', // primary-300  the modules
    logo: '#fcd8a2', // primary-200  brighter than the modules, so the mark is the focal point
  },
  secondary: {
    tile: '#212e09', // secondary-900
    dotSoft: '#578b35', // secondary-500
    dotBright: '#91c985', // secondary-300
    plate: '#121904', // secondary-950
    ink: '#91c985', // secondary-300
    logo: '#b8e1b8', // secondary-200
  },
} as const

/**
 * How much of the symbol's width the centre logo knockout takes.
 *
 * 0.24 of the width is ~5.8% of the **area**. The usual ceiling quoted for a centre mark is
 * 25–30% of area, and error correction `H` recovers 30% of the codewords, so this is a
 * quarter of the budget — deliberately conservative, because the damage is concentrated in
 * one place rather than spread out, which is the harder case for the Reed–Solomon blocks.
 */
const LOGO_FRACTION = 0.24

/** The tile is a 100-unit square; every dimension below is in those units. */
const TILE = 100
/**
 * 9×9 identicon grid — only the outer ring of cells stays visible around the plate.
 *
 * Not 7×7. A wider band looks better in isolation and costs 13% of the QR's module size,
 * which at 192 px is the difference between every module reading correctly and two of them
 * not (see the table above). The pattern is the decoration; the code is the function.
 */
const GRID = 9
const CELL = TILE / GRID
/** The plate starts exactly where the identicon's border band ends, so they interlock. */
const PLATE_INSET = CELL
const PLATE_SIZE = TILE - 2 * PLATE_INSET
/** Padding inside the plate, on top of the QR's own two-module quiet zone. */
const PLATE_PAD = 2.2
/** Quiet zone, in modules. Two is the practical floor; the spec asks for four. */
const QUIET = 2

/**
 * Two renderings of the same identity, picked by how large it will be drawn.
 *
 * - `badge` — the identicon frame with the scannable QR set into it. For `lg` and up.
 * - `mark` — the identicon alone, as a coarse 5×5. For the header, comment threads and
 *   anywhere else the avatar is 24–40px.
 *
 * The split exists because a QR rendered at 32px is not a small QR, it is grey noise: the
 * modules fall below a pixel and the thing stops being either scannable *or* recognisable,
 * which fails both halves of the brief at once. At that size the job is "tell two users
 * apart at a glance", and a coarse identicon does it far better than a dense one. The ramp
 * and the seed are shared, so a person's mark and their badge read as the same identity.
 */
export type AvatarVariant = 'badge' | 'mark'

export interface BrandMark {
  viewBox: string
  transform: string
  paths: string[]
}

/**
 * Pull the chef's hat out of `public/icon.svg`.
 *
 * The mark is **not** duplicated into this file. It is ~4 KB of path data that also lives in
 * `BrandLogo.vue`, and a third hand-copied version is a third thing to forget when the logo
 * changes. The caller passes the file's contents in — the endpoint reads it as a Nitro
 * server asset, the unit test reads it with `fs` — so both exercise the real artwork.
 *
 * Returns `null` on anything unexpected rather than throwing: a missing or restructured
 * icon file must degrade to a badge without a logo, not to a 500 on an `<img src>` that
 * sits in the header of every page.
 */
export function parseBrandMark(svg: string | null | undefined): BrandMark | null {
  if (!svg) return null
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1]
  const transform = /<g[^>]*\stransform="([^"]+)"/.exec(svg)?.[1]
  const paths = [...svg.matchAll(/<path[^>]*\sd="([\s\S]*?)"/g)].map((m) => m[1]!.replace(/\s+/g, ' ').trim())
  if (!viewBox || !transform || paths.length === 0) return null
  return { viewBox, transform, paths }
}

export interface IdenticonAvatarOptions {
  username: string
  /** Absolute origin, e.g. `https://gourmerge.de`. The QR encodes `${origin}/${username}`. */
  origin: string
  /** Defaults to `badge`. See {@link AvatarVariant}. */
  variant?: AvatarVariant
  /**
   * The brand mark to set into the middle of the code. Omit for a plain symbol — the
   * `mark` variant ignores it either way.
   */
  logo?: BrandMark | null
}

/** The mark's grid. Coarse on purpose — 5×5 is what still reads at 24px. */
const MARK_GRID = 5

/**
 * Where the QR's modules land inside the tile, for a matrix of `moduleCount` per side.
 *
 * Exported so `tests/unit/identiconAvatar.test.ts` can rasterise the badge and sample the
 * centre of every module against the real matrix — the only way to answer "is this still
 * machine-readable after the styling?" with a number instead of an opinion.
 */
export function qrGeometry(moduleCount: number): { tile: number; origin: number; module: number } {
  const module = (PLATE_SIZE - 2 * PLATE_PAD) / (moduleCount + 2 * QUIET)
  return { tile: TILE, origin: PLATE_INSET + PLATE_PAD + QUIET * module, module }
}

/**
 * Deterministic bytes for every choice below. SHA-256 rather than a cheap string hash so
 * two similar usernames (`anna` / `anna1`) land nowhere near each other — an identicon whose
 * neighbours look alike is worse than no identicon.
 */
function seedOf(username: string): Buffer {
  return createHash('sha256').update(`gourmerge-avatar:${username.toLowerCase()}`).digest()
}

/**
 * A left-right mirrored grid, GitHub-identicon style — mirrored rather than 4-fold
 * symmetric because two axes of symmetry read as a snowflake and stop looking individual.
 *
 * Only the border ring is ever painted (the plate covers the rest), so what matters is the
 * independent border cells' 2-bit values: 0 = empty, 1 = small dot, 2 = medium, 3 = large.
 * On a 9×9 that is 15 of them — 30 bits, doubled by the ramp choice.
 */
function identiconCells(seed: Buffer, grid: number, borderOnly: boolean, bitOffset = 0): number[][] {
  const cells: number[][] = Array.from({ length: grid }, () => Array.from({ length: grid }, () => 0))
  let bit = bitOffset
  const take = () => {
    const byte = seed[Math.floor(bit / 4) % seed.length]!
    const shift = (bit % 4) * 2
    bit++
    return (byte >> shift) & 0b11
  }

  for (let r = 0; r < grid; r++) {
    for (let c = 0; c <= Math.floor(grid / 2); c++) {
      if (borderOnly && !(r === 0 || r === grid - 1 || c === 0)) continue
      const value = take()
      cells[r]![c] = value
      cells[r]![grid - 1 - c] = value
    }
  }
  return cells
}

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`)

/**
 * The small variant: a coarse 5×5 mirrored identicon, drawn as rounded squares rather than
 * dots so it still holds a shape at 24px.
 *
 * Squares, not circles, and not the badge's bezel dots: at this size a circle loses most of
 * its area to antialiasing and the whole tile turns to mush — which is the same reason the
 * QR is dropped here rather than shrunk.
 */
function renderMark(seed: Buffer, ramp: (typeof RAMPS)[keyof typeof RAMPS]): string {
  const cells = identiconCells(seed, MARK_GRID, false)
  const inset = 8
  const cell = (TILE - 2 * inset) / MARK_GRID
  const parts = [`<rect width="${TILE}" height="${TILE}" fill="${ramp.tile}"/>`]

  for (let r = 0; r < MARK_GRID; r++) {
    for (let c = 0; c < MARK_GRID; c++) {
      const value = cells[r]![c]!
      if (value === 0) continue
      // Value 1 is the lighter shade; 2 and 3 both take the accent, with 3 filling its cell
      // edge to edge so the pattern has a strong tier as well as a quiet one.
      const pad = value === 3 ? 0.06 : 0.16
      const size = cell * (1 - 2 * pad)
      parts.push(
        `<rect x="${(inset + c * cell + cell * pad).toFixed(2)}" y="${(inset + r * cell + cell * pad).toFixed(2)}" ` +
          `width="${size.toFixed(2)}" height="${size.toFixed(2)}" rx="${(size * 0.28).toFixed(2)}" fill="${
            value === 1 ? ramp.dotSoft : ramp.dotBright
          }"/>`
      )
    }
  }
  return parts.join('')
}

/**
 * Render the badge.
 *
 * @returns a standalone SVG document. It contains only `<rect>`, `<circle>` and `<path>` —
 *   no script, no `<foreignObject>`, no external reference — which is what makes it safe to
 *   serve as `image/svg+xml` from our own origin.
 */
export async function renderIdenticonAvatar({
  username,
  origin,
  variant = 'badge',
  logo = null,
}: IdenticonAvatarOptions): Promise<string> {
  const seed = seedOf(username)
  const ramp = seed[0]! % 2 === 0 ? RAMPS.primary : RAMPS.secondary
  const title = escapeXml(username)
  const document = (body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TILE} ${TILE}" width="${TILE}" height="${TILE}" ` +
    `role="img" aria-label="${title}"><title>${title}</title>${body}</svg>`

  if (variant === 'mark') return document(renderMark(seed, ramp))

  // The bezel reads bits 1.. so the mark and the badge of one user are different
  // arrangements rather than the same one twice.
  const cells = identiconCells(seed, GRID, true, 8)

  /**
   * Error correction **`H` (30%) when a logo is set into the middle, `M` (15%) otherwise.**
   *
   * This is not a preference, it is the price of the logo. Knocking a hole in the centre
   * destroys the modules underneath, and `H` is the level that can reconstruct them. The
   * cost is real and worth stating: `H` needs a bigger symbol for the same URL, so each
   * module is smaller at the same rendered size — measured, ~12% smaller. That is affordable
   * only because the badge is rendered at 192px where there was headroom; it is exactly the
   * headroom the 9×9 bezel and the tight plate padding bought earlier.
   *
   * Without a logo `M` still wins: the dot styling already spends some tolerance (a circle
   * inscribed in its square is ~74% of a solid block), and `M` buys that back without
   * shrinking anything.
   */
  const qr = QRCode.create(`${origin}/${username}`, { errorCorrectionLevel: logo ? 'H' : 'M' })
  const n = qr.modules.size
  const dark = (r: number, c: number) => qr.modules.data[r * n + c] === 1

  const { origin: qrOrigin, module } = qrGeometry(n)

  /**
   * The centred square the logo occupies, in tile units. Empty when there is no logo.
   *
   * `logoPad` is the plate-coloured ring drawn around the mark, and the skip test below uses
   * **the same number** plus a hair. That is not tidiness: the pad is painted after the
   * dots, so any dot the skip missed but the pad covers gets silently erased — it reads
   * light where the matrix says dark, and the module is simply lost. The first version had a
   * skip of 0.6 modules against a pad of 0.9 and lost exactly the ring between them, which
   * the rasterise-and-sample test caught as one stray module. One constant, both uses.
   */
  const qrSpan = n * module
  const logoSize = logo ? qrSpan * LOGO_FRACTION : 0
  const logoLeft = qrOrigin + (qrSpan - logoSize) / 2
  const logoPad = module * 0.9
  const skip = logoPad + module * 0.1
  const inLogo = (px: number, py: number) =>
    logo !== null &&
    px > logoLeft - skip &&
    px < logoLeft + logoSize + skip &&
    py > logoLeft - skip &&
    py < logoLeft + logoSize + skip

  const parts: string[] = []

  // ── Identicon frame ────────────────────────────────────────────
  parts.push(`<rect width="${TILE}" height="${TILE}" fill="${ramp.tile}"/>`)
  const DOT_R = [0, 0.16, 0.26, 0.34] // by cell value, as a fraction of a cell
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const value = cells[r]![c]!
      if (value === 0) continue
      // Interior cells are under the plate; drawing them would be invisible work.
      if (r > 0 && r < GRID - 1 && c > 0 && c < GRID - 1) continue
      const cx = (c + 0.5) * CELL
      const cy = (r + 0.5) * CELL
      parts.push(
        `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(DOT_R[value]! * CELL).toFixed(2)}" fill="${
          value === 1 ? ramp.dotSoft : ramp.dotBright
        }"/>`
      )
    }
  }

  // ── Plate ──────────────────────────────────────────────────────
  // The hairline ring ties the plate to the frame; without it the two halves read as two
  // objects rather than one badge.
  parts.push(
    `<rect x="${PLATE_INSET}" y="${PLATE_INSET}" width="${PLATE_SIZE}" height="${PLATE_SIZE}" rx="9" ` +
      `fill="${ramp.plate}" stroke="${ramp.dotBright}" stroke-opacity="0.35" stroke-width="0.9"/>`
  )

  // ── QR ─────────────────────────────────────────────────────────
  const x = (c: number) => qrOrigin + c * module
  const y = (r: number) => qrOrigin + r * module

  /** The 8×8 reserved area around each finder pattern — data dots must not be drawn there. */
  const inFinder = (r: number, c: number) => (r < 8 && c < 8) || (r < 8 && c >= n - 8) || (r >= n - 8 && c < 8)

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!dark(r, c) || inFinder(r, c)) continue
      const cx = x(c) + module / 2
      const cy = y(r) + module / 2
      // Skipped rather than painted-over: a dot half-under the knockout would poke out past
      // its rounded corners, and the quiet ring around the logo is what keeps the mark
      // legible as a mark instead of as a smudge in a field of dots.
      if (inLogo(cx, cy)) continue
      parts.push(
        `<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${(module * 0.47).toFixed(3)}" fill="${ramp.ink}"/>`
      )
    }
  }

  /**
   * The three eyes, drawn as shapes rather than as dots. A decoder locates the symbol by
   * their 1:1:3:1:1 dark/light ratio, so they are the one place where "make it look softer"
   * has to stop at rounded corners.
   *
   * **The radii are bounded, and the bound is geometric rather than aesthetic.** A module's
   * centre sits 0.5 modules in from the corner of the shape it belongs to, and the rounding
   * arc excludes that point once `(rx − 0.5)·√2 > rx`, i.e. above `rx ≈ 1.71` modules. The
   * first draft used `2.1` and it looked lovely and silently deleted **17 modules** across
   * the three eyes — every corner of every ring — which the rasterise-and-sample test in
   * `tests/unit/identiconAvatar.test.ts` is what caught. These values keep a comfortable
   * margin under that bound.
   */
  const EYE_RX = 0.8
  const WINDOW_RX = 0.8
  const CORE_RX = 0.6
  for (const [fr, fc] of [
    [0, 0],
    [0, n - 7],
    [n - 7, 0],
  ] as const) {
    const ox = x(fc)
    const oy = y(fr)
    const rect = (inset: number, span: number, rx: number, fill: string) =>
      `<rect x="${(ox + module * inset).toFixed(3)}" y="${(oy + module * inset).toFixed(3)}" width="${(
        module * span
      ).toFixed(3)}" height="${(module * span).toFixed(3)}" rx="${(module * rx).toFixed(3)}" fill="${fill}"/>`
    parts.push(rect(0, 7, EYE_RX, ramp.ink), rect(1, 5, WINDOW_RX, ramp.plate), rect(2, 3, CORE_RX, ramp.ink))
  }

  /**
   * The chef's hat, set into the middle.
   *
   * Drawn last so it sits over anything the skip above did not catch, on its own
   * plate-coloured pad — the pad is what gives the mark a quiet ring and stops it reading as
   * a smudge among the dots. A **nested `<svg>`** rather than a transformed `<g>`: the mark
   * carries its own `viewBox` and an internal `translate/scale`, and re-deriving that as one
   * matrix is arithmetic nobody would ever check. The nested element does it exactly.
   *
   * `ramp.logo` (the 200), a step brighter than the modules: the logo is not a module, so it
   * owes the decoder no contrast, and being the lightest thing on the plate is what makes it
   * read as the focal point rather than as a dense patch of code.
   */
  if (logo) {
    parts.push(
      `<rect x="${(logoLeft - logoPad).toFixed(3)}" y="${(logoLeft - logoPad).toFixed(3)}" width="${(
        logoSize +
        2 * logoPad
      ).toFixed(3)}" height="${(logoSize + 2 * logoPad).toFixed(3)}" rx="${(module * 1.4).toFixed(
        3
      )}" fill="${ramp.plate}"/>`,
      `<svg x="${logoLeft.toFixed(3)}" y="${logoLeft.toFixed(3)}" width="${logoSize.toFixed(3)}" height="${logoSize.toFixed(
        3
      )}" viewBox="${logo.viewBox}" preserveAspectRatio="xMidYMid meet">` +
        `<g transform="${logo.transform}" fill="${ramp.logo}" stroke="none">` +
        logo.paths.map((d) => `<path d="${d}"/>`).join('') +
        `</g></svg>`
    )
  }

  return document(parts.join(''))
}
