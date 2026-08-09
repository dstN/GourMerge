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
 * So the identicon is the **frame** and the QR sits on an opaque plate at the centre —
 * literally an identicon with a code set into it, and both halves keep their job. The frame
 * is a genuine 9×9 mirrored identicon grid laid over the whole tile whose interior is
 * covered by the plate, which is why it reads as one object rather than as a sticker on
 * wallpaper.
 *
 * ## What makes it still scan
 *
 * 1. **Contrast.** Modules are the ramp's 950 on the 50 — 15:1. Brand saffron *as the
 *    module colour* measures about 2:1 on cream and would be decorative nonsense.
 * 2. **A quiet zone.** Two modules of plate on every side, inside the plate's own padding.
 *    Decoders fail without it far more often than they fail on styling.
 * 3. **Intact finder patterns.** The three eyes are drawn as rounded squares — corner
 *    radius is tolerated, losing the ring structure is not — and no data dot is drawn
 *    inside their 8×8 reserved area.
 * 4. **Generous dots.** Radius 0.47 of a module, so adjacent dark modules nearly touch.
 *    Prettier and smaller loses ink until binarisation starts dropping modules.
 * 5. **Enough pixels per module**, which is the constraint everything else was tuned
 *    against. `tests/unit/identiconAvatar.test.ts` rasterises the real SVG and samples every
 *    module centre; the numbers that came out of it are:
 *
 *    | rendered | px/module | modules read wrongly |
 *    | -------- | --------- | -------------------- |
 *    | 128 px   | 2.5–3.2   | 3–77                 |
 *    | 160 px   | 3.2–4.1   | 0–3                  |
 *    | 192 px   | 3.8–4.9   | **0**                |
 *    | 256 px+  | 5.1+      | **0**                |
 *
 *    That table is why the identicon band is one cell of a **9×9** grid rather than a 7×7:
 *    the thinner frame buys ~13% module size, and it is the difference between "0 wrong at
 *    192 px" and "2 wrong". It is also why `<CommonUserAvatar size="2xl">` (192 px) exists
 *    and is what the profile page uses — the one place a stranger would point a camera.
 *    Below `md` the badge is an identity mark, not a scanning target, and that is fine.
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
 * browser's colour support.
 */
import { createHash } from 'node:crypto'
import QRCode from 'qrcode'

/** sRGB of the `--color-{primary,secondary}-*` tokens in main.css. Keep in step. */
const RAMPS = {
  primary: { wash: '#fcedd1', soft: '#f6bb6a', accent: '#dd7d00', ink: '#381706' },
  secondary: { wash: '#d7f0d9', soft: '#91c985', accent: '#578b35', ink: '#121904' },
} as const

/** `--color-primary-50`. One plate colour for both ramps, so ink contrast is a constant. */
const PLATE = '#fff8ea'

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

export interface IdenticonAvatarOptions {
  username: string
  /** Absolute origin, e.g. `https://gourmerge.de`. The QR encodes `${origin}/${username}`. */
  origin: string
  /** Defaults to `badge`. See {@link AvatarVariant}. */
  variant?: AvatarVariant
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
  const parts = [`<rect width="${TILE}" height="${TILE}" fill="${ramp.wash}"/>`]

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
            value === 1 ? ramp.soft : ramp.accent
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
   * Error correction `M` (15%), not `L`. The dot styling already spends some of the
   * decoder's tolerance — every module is a circle inscribed in its square, so the ink a
   * blur sees is ~74% of a solid block — and `M` is what buys that back. `H` would add
   * roughly a third more modules, making each one smaller at the same pixel size, which
   * costs more than the redundancy gains at avatar scale.
   */
  const qr = QRCode.create(`${origin}/${username}`, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const dark = (r: number, c: number) => qr.modules.data[r * n + c] === 1

  const { origin: qrOrigin, module } = qrGeometry(n)

  const parts: string[] = []

  // ── Identicon frame ────────────────────────────────────────────
  parts.push(`<rect width="${TILE}" height="${TILE}" fill="${ramp.wash}"/>`)
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
          value === 1 ? ramp.soft : ramp.accent
        }"/>`
      )
    }
  }

  // ── Plate ──────────────────────────────────────────────────────
  // The hairline ring ties the plate to the frame; without it the two halves read as two
  // objects rather than one badge.
  parts.push(
    `<rect x="${PLATE_INSET}" y="${PLATE_INSET}" width="${PLATE_SIZE}" height="${PLATE_SIZE}" rx="9" ` +
      `fill="${PLATE}" stroke="${ramp.accent}" stroke-opacity="0.35" stroke-width="0.9"/>`
  )

  // ── QR ─────────────────────────────────────────────────────────
  const x = (c: number) => qrOrigin + c * module
  const y = (r: number) => qrOrigin + r * module

  /** The 8×8 reserved area around each finder pattern — data dots must not be drawn there. */
  const inFinder = (r: number, c: number) => (r < 8 && c < 8) || (r < 8 && c >= n - 8) || (r >= n - 8 && c < 8)

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!dark(r, c) || inFinder(r, c)) continue
      parts.push(
        `<circle cx="${(x(c) + module / 2).toFixed(3)}" cy="${(y(r) + module / 2).toFixed(3)}" r="${(
          module * 0.47
        ).toFixed(3)}" fill="${ramp.ink}"/>`
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
  const EYE_RX = 1
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
    parts.push(rect(0, 7, EYE_RX, ramp.ink), rect(1, 5, WINDOW_RX, PLATE), rect(2, 3, CORE_RX, ramp.ink))
  }

  return document(parts.join(''))
}
