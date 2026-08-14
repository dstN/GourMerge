/**
 * Generate a branded 1200×630 PNG for recipes with no uploaded photo — the OG-image
 * fallback. Copies `imageEncode.ts`'s (i.e. `sharp`'s) established pattern file-for-file:
 * lazy `import()` inside a try/catch, fail open, an `xAvailable()` check surfaced as a
 * warning (never an error) on `/api/health`.
 *
 * This is the one native-binary dependency in the app that isn't `sharp` — `satori`
 * (layout) + `@resvg/resvg-js` (rasterizing satori's SVG output to PNG). Both go in
 * `devDependencies`, mirroring where `sharp` already lives (`npm ci` in `deploy.yml`
 * installs the full lockfile regardless), and both are loaded lazily so a host that can't
 * run the native binary never takes anything else down with it — the caller
 * (`og-image.get.ts`) degrades to the static default image on any failure here, including
 * a missing/incompatible binary.
 *
 * Title only, canonical (untranslated): rendering four locales' worth of scripts through a
 * rasterizer with no font-fallback chain is real unbudgeted scope, not required for a
 * "recipe title on a branded background" minimum.
 */

const WIDTH = 1200
const HEIGHT = 630

// Same sRGB constants `identiconAvatar.ts` already duplicates for server-side use — no
// third copy of the palette. `plate`/`logo` from that file's "orange" ramp (primary-950 /
// primary-200), the same dark-ground-bright-mark pairing the identicon badge uses.
const BACKGROUND = '#381706'
const ACCENT = '#f6bb6a'
const TITLE_COLOR = '#fcd8a2'

/**
 * NOTE — the actual font binary still needs to be added by hand:
 * `server/assets/fonts/DMSans-Bold.ttf` (a static TTF weight; OFL-licensed, so a static
 * copy is fine to vendor — download the Bold weight from Google Fonts' DM Sans page or
 * https://github.com/googlefonts/dm-fonts). `@nuxt/fonts` already fetches DM Sans as
 * WOFF2 for the browser at build time, but satori needs its own TTF/OTF bytes and cannot
 * reliably consume a build-time-fetched, hashed-filename WOFF2. Until this file exists,
 * `loadFont()` returns `null` and every recipe without a photo falls back to the static
 * default OG image — safe (nothing breaks, nothing looks broken), just not the branded
 * card until the font is in place.
 */
let fontCache: Buffer | null | undefined

async function loadFont(): Promise<Buffer | null> {
  if (fontCache !== undefined) return fontCache
  try {
    // `getItemRaw`, not `getItem`: a font is genuinely binary, and `getItem`'s dev-mode
    // text-decoding path (see `avatar.get.ts`'s docblock on this exact distinction for the
    // brand SVG) would corrupt bytes that are not valid UTF-8. `getItemRaw` is unstorage's
    // answer to exactly this — always the raw stored value, no text coercion.
    const raw = await useStorage('assets:fonts').getItemRaw('DMSans-Bold.ttf')
    fontCache = raw ? Buffer.from(raw as ArrayBuffer | Uint8Array) : null
  } catch {
    fontCache = null
  }
  return fontCache
}

export async function ogImageRasterizerAvailable(): Promise<boolean> {
  try {
    await import('satori')
    await import('@resvg/resvg-js')
    return true
  } catch {
    return false
  }
}

export async function renderOgImageForTitle(title: string): Promise<Buffer | null> {
  try {
    const font = await loadFont()
    if (!font) return null

    const { default: satori } = await import('satori')
    const { Resvg } = await import('@resvg/resvg-js')

    const svg = await satori(
      {
        type: 'div',
        props: {
          style: {
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '80px',
            backgroundColor: BACKGROUND,
            fontFamily: 'DM Sans',
          },
          children: [
            {
              type: 'div',
              props: {
                style: { fontSize: 28, color: ACCENT, marginBottom: 24, letterSpacing: 2 },
                children: 'GOURMERGE',
              },
            },
            {
              type: 'div',
              props: {
                style: {
                  fontSize: 64,
                  fontWeight: 700,
                  color: TITLE_COLOR,
                  lineHeight: 1.2,
                  display: 'block',
                  // satori has no native line-clamp; a hard length cap on the input
                  // (the caller truncates) is what actually keeps this on-canvas.
                },
                children: title,
              },
            },
          ],
        },
      },
      {
        width: WIDTH,
        height: HEIGHT,
        fonts: [{ name: 'DM Sans', data: font, weight: 700, style: 'normal' }],
      }
    )

    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } })
    return resvg.render().asPng()
  } catch (err) {
    logger.warn('OG image render failed, degrading to static default', { err: String(err) })
    return null
  }
}
