/**
 * GET /api/recipes/:id/image — deliver the recipe photo.
 *
 * ## Caching
 *
 * The URL carries `?v=<checksum>`, so the bytes at a given URL can never change and the
 * response is `immutable` for a year. A replaced photo produces a different checksum and
 * therefore a different URL. An `ETag` is still sent for the case where a client kept the
 * old URL: it turns that into a 304 instead of a second full transfer.
 *
 * ## Headers that are not optional
 *
 * `Content-Type` comes from the sniffed type stored at upload, never from anything the
 * uploader said. `X-Content-Type-Options: nosniff` is already global (`nuxt.config`
 * routeRules) and is what stops a browser from second-guessing that. `Content-Disposition:
 * inline` with a fixed, generated filename keeps a user-supplied filename out of a header.
 *
 * A private recipe's photo is behind the same 404-not-403 check as the recipe itself —
 * otherwise the image endpoint would confirm the existence of private recipes that the
 * recipe endpoint carefully does not.
 */
import { eq } from 'drizzle-orm'
import { recipeImages } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const recipeId = Number(getRouterParam(event, 'id'))
  const recipe = await requireVisibleRecipe(event, recipeId)

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [image] = await db
    .select({
      mimeType: recipeImages.mimeType,
      checksum: recipeImages.checksum,
      byteSize: recipeImages.byteSize,
      data: recipeImages.data,
    })
    .from(recipeImages)
    .where(eq(recipeImages.recipeId, recipe.id))
    .limit(1)

  if (!image) throw createError({ statusCode: 404, statusMessage: 'No image' })

  const etag = `"${image.checksum}"`
  setResponseHeader(event, 'ETag', etag)
  setResponseHeader(event, 'Content-Type', image.mimeType)
  setResponseHeader(event, 'Content-Disposition', `inline; filename="recipe-${recipe.id}.${extFor(image.mimeType)}"`)
  /**
   * `private` when the recipe is: a shared proxy must not hold a copy of an image only
   * its owner may see. Public recipes get the full `public, immutable` treatment because
   * the checksum in the URL makes staleness impossible.
   */
  setResponseHeader(
    event,
    'Cache-Control',
    recipe.visibility === 'private' ? 'private, max-age=0, must-revalidate' : 'public, max-age=31536000, immutable'
  )

  if (getRequestHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304)
    return null
  }

  // `Content-Length` is deliberately not set by hand. Nitro derives it from the Buffer it
  // actually sends; `byteSize` is a stored number, and a header that disagrees with the
  // body by even one byte truncates or hangs the response.
  return image.data
})

function extFor(mime: string): string {
  return mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
}
