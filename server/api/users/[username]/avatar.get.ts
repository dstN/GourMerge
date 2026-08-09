/**
 * GET /api/users/:username/avatar — the generated identicon-QR badge.
 *
 * Served for anyone who has not uploaded a picture. It is a mirrored identicon frame with a
 * dotted, scannable QR of that user's profile URL set into the middle — so "no avatar yet"
 * stops being an absence and becomes something that does a job: a per-user mark that makes
 * a comment thread readable at a glance, and a code you can point a phone at.
 *
 * The composition, the colour rules and every constraint that keeps it machine-readable
 * live in `server/utils/identiconAvatar.ts`. This file is only the HTTP edge.
 *
 * ## Why there is no database lookup here
 *
 * The badge is a pure function of the username, and this endpoint renders on nearly every
 * page (the header) for every visitor. A row read per avatar would put a query on the
 * hottest path in the app to learn something the URL already says. A username that does not
 * exist yields a code pointing at a profile page that 404s — the same answer the visitor
 * would get by typing the URL, and nothing is disclosed either way, because the encoded
 * text is the caller's own input.
 *
 * The username is still validated against the exact charset registration enforces, so this
 * cannot be turned into a generic "put arbitrary text in a QR on gourmerge.de" service.
 */
import { renderIdenticonAvatar, parseBrandMark, type BrandMark } from '~~/server/utils/identiconAvatar'

/** Same rule as `registerSchema.username` — keep the two in step. */
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,50}$/

/**
 * The chef's hat, parsed once per process.
 *
 * `undefined` = not looked up yet, `null` = looked up and unavailable. The distinction
 * matters: without it a missing asset would re-read storage on every avatar request, and
 * this endpoint runs on nearly every page view.
 *
 * A failure here degrades to a badge without a logo, never to an error. This is an
 * `<img src>` in the site header; a 500 would put a broken image on every page because the
 * icon file moved.
 */
let brandMark: BrandMark | null | undefined

async function getBrandMark(): Promise<BrandMark | null> {
  if (brandMark !== undefined) return brandMark
  try {
    const svg = await useStorage('assets:brand').getItem<string>('icon.svg')
    brandMark = parseBrandMark(typeof svg === 'string' ? svg : null)
  } catch {
    brandMark = null
  }
  return brandMark
}

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')
  if (!username || !USERNAME_RE.test(username)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  /**
   * `?variant=mark` returns the identicon alone, for the sizes where a QR would be noise
   * rather than a code — see `AvatarVariant`. An unknown value falls back to the badge
   * rather than erroring: this is an `<img src>` on nearly every page, and a broken image
   * is a worse answer than the default one.
   */
  const variant = getQuery(event).variant === 'mark' ? 'mark' : 'badge'

  const origin = String(useRuntimeConfig(event).public.appUrl || '').replace(/\/+$/, '')
  // The small `mark` has no code to set a logo into, so it does not pay for the lookup.
  const logo = variant === 'badge' ? await getBrandMark() : null
  const svg = await renderIdenticonAvatar({ username, origin, variant, logo })

  /**
   * `image/svg+xml` from our own origin is normally a stored-XSS shape — but nothing here is
   * user-authored: the document is assembled from shapes by the renderer, and the only
   * variable text is the username, escaped, inside a `<title>`. The CSP below is belt and
   * braces for the case where someone opens the URL directly rather than as an `<img src>`:
   * `sandbox` with no allow-list means no script and no navigation even then.
   */
  setResponseHeader(event, 'Content-Type', 'image/svg+xml; charset=utf-8')
  setResponseHeader(event, 'Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  // Deterministic output: same username, same bytes, forever. A user who later uploads a
  // photo is unaffected — the component stops pointing here entirely.
  setResponseHeader(event, 'Cache-Control', 'public, max-age=604800, immutable')
  return svg
})
