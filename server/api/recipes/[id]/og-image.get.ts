/**
 * GET /api/recipes/:id/og-image — generated social-card fallback for a recipe with no
 * uploaded photo.
 *
 * `requireVisibleRecipe()` is load-bearing here, not optional: without it this becomes a
 * second existence-oracle for private recipes — the exact bug class the 2026-08-09 audit
 * already fixed three instances of (see ROADMAP.md).
 *
 * Rate-limited by IP: the only unauthenticated, CPU-bound route in the app on a
 * RAM-constrained shared host, and scrapers will hit it on every share.
 *
 * On ANY failure — private recipe, missing native binary, font not in place, whatever —
 * this redirects to the site's static default image rather than 500ing or serving a
 * broken one. 302, not 301: a 301 would let a scraper cache "no image" past the point a
 * host issue gets fixed.
 */
import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { recipes } from '~~/server/database/schema'
import { renderOgImageForTitle } from '~~/server/utils/ogImageRender'

const STATIC_FALLBACK = '/pwa-512x512.png'
/** Long enough to read on a 1200×630 card without risking overflow past the canvas. */
const MAX_TITLE_LENGTH = 90

export default defineEventHandler(async (event) => {
  await useRateLimit(getRateLimitKey(event, 'recipe:og-image'), { max: 30, windowSeconds: 60 })

  const recipeId = Number(getRouterParam(event, 'id'))
  if (isNaN(recipeId)) return sendRedirect(event, STATIC_FALLBACK, 302)

  let visible: Awaited<ReturnType<typeof requireVisibleRecipe>>
  try {
    visible = await requireVisibleRecipe(event, recipeId)
  } catch {
    return sendRedirect(event, STATIC_FALLBACK, 302)
  }

  const db = useDrizzle()
  if (!db) return sendRedirect(event, STATIC_FALLBACK, 302)

  const [recipe] = await db
    .select({ title: recipes.title, updatedAt: recipes.updatedAt })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1)
  if (!recipe) return sendRedirect(event, STATIC_FALLBACK, 302)

  const etag = `"${createHash('sha256').update(`${recipeId}|${recipe.title}|${recipe.updatedAt.toISOString()}`).digest('hex')}"`
  if (getHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304)
    return null
  }

  const png = await renderOgImageForTitle(recipe.title.slice(0, MAX_TITLE_LENGTH))
  if (!png) return sendRedirect(event, STATIC_FALLBACK, 302)

  setHeader(event, 'content-type', 'image/png')
  setHeader(event, 'etag', etag)
  setHeader(
    event,
    'cache-control',
    visible.visibility === 'public' ? 'public, max-age=3600' : 'private, max-age=0, must-revalidate'
  )
  return png
})
