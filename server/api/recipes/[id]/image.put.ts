/**
 * PUT /api/recipes/:id/image — set (or replace) the recipe's one serving-suggestion photo.
 *
 * Owner only, one image per recipe, enforced by the UNIQUE index on `recipe_images` and
 * by upserting rather than inserting.
 *
 * ## The size guard runs before the body is read
 *
 * `readMultipartFormData` buffers the whole request in memory. Checking the length after
 * parsing means the abuse has already happened: a handful of concurrent 100 MB uploads is
 * an OOM on a shared Passenger worker, and this endpoint needs a session but any signed-up
 * account has one. So `Content-Length` is required and checked first, and a request that
 * declines to declare its length is refused outright rather than streamed hopefully.
 * Browsers always send it for a `fetch` with a `Blob`/`FormData` body.
 *
 * The declared length is not trusted as the real size either — the parsed part is measured
 * again below. The header is a cheap early exit, not the authority.
 *
 * Answering before the body has been read leaves unread bytes on the socket, so both early
 * rejections send `Connection: close`. Without it Node destroys the socket at the end of the
 * response and the *next* request on that keep-alive connection dies with `ECONNRESET`
 * instead of getting an answer — which is how this surfaced: the 413 assertion passed and
 * the following test failed on an unrelated `/auth/register`. Draining the body instead
 * would defeat the entire point of checking early.
 */
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { recipeImages, recipes } from '~~/server/database/schema'

/**
 * 3 MB on the wire. The uploader downsizes to 1600px WebP before sending (typically
 * 150–350 KB), so this is the ceiling for a client that skipped that — an original
 * phone JPEG — not the expected size.
 */
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024
/** Below this it is a thumbnail, not a photo, and it will look broken in the layout. */
const MIN_EDGE_PX = 200
/** Above this someone is uploading a poster; MEDIUMBLOB would cope, the page would not. */
const MAX_EDGE_PX = 6000

const altSchema = z.string().trim().max(300)

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const recipeId = Number(getRouterParam(event, 'id'))
  const recipe = await requireVisibleRecipe(event, recipeId)
  if (!recipe.isOwner) throw createError({ statusCode: 403, statusMessage: 'Not the recipe owner' })

  const declared = Number(getRequestHeader(event, 'content-length'))
  if (!Number.isFinite(declared) || declared <= 0) {
    setResponseHeader(event, 'Connection', 'close')
    throw createError({ statusCode: 411, statusMessage: 'Content-Length required' })
  }
  if (declared > MAX_UPLOAD_BYTES) {
    setResponseHeader(event, 'Connection', 'close')
    throw createError({ statusCode: 413, statusMessage: 'Image too large' })
  }

  await useRateLimit(`recipe:image:${session.user.id}`, { max: 20, windowSeconds: 600 })

  const parts = await readMultipartFormData(event)
  const filePart = parts?.find((p) => p.name === 'file' && p.filename !== undefined)
  if (!filePart?.data?.length) throw createError({ statusCode: 422, statusMessage: 'No image supplied' })
  if (filePart.data.length > MAX_UPLOAD_BYTES) throw createError({ statusCode: 413, statusMessage: 'Image too large' })

  // Sniffed from the bytes; the part's own Content-Type is discarded (see imageProbe.ts).
  const probed = probeImage(filePart.data)
  if (!probed) {
    throw createError({ statusCode: 415, statusMessage: 'Unsupported image format — use JPEG, PNG or WebP' })
  }
  const shortest = Math.min(probed.width, probed.height)
  const longest = Math.max(probed.width, probed.height)
  if (shortest < MIN_EDGE_PX || longest > MAX_EDGE_PX) {
    throw createError({ statusCode: 422, statusMessage: 'Image dimensions out of range' })
  }

  const altRaw = parts?.find((p) => p.name === 'altText')?.data?.toString('utf8') ?? ''
  const alt = altSchema.safeParse(altRaw)
  if (!alt.success) throw createError({ statusCode: 422, statusMessage: 'Validation failed' })

  const checksum = createHash('sha256').update(filePart.data).digest('hex')

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const row = {
    recipeId: recipe.id,
    mimeType: probed.mimeType,
    width: probed.width,
    height: probed.height,
    byteSize: filePart.data.length,
    checksum,
    altText: alt.data || null,
    data: filePart.data,
  }

  /**
   * Upsert on the UNIQUE `recipe_id`, so replacing a photo is one statement and cannot
   * leave a recipe briefly image-less between a DELETE and an INSERT.
   */
  await db
    .insert(recipeImages)
    .values(row)
    .onDuplicateKeyUpdate({
      set: {
        mimeType: row.mimeType,
        width: row.width,
        height: row.height,
        byteSize: row.byteSize,
        checksum: row.checksum,
        altText: row.altText,
        data: row.data,
      },
    })

  // Bump the recipe so caches keyed on `updatedAt` (explore cards, sitemap) notice.
  await db.update(recipes).set({ updatedAt: new Date() }).where(eq(recipes.id, recipe.id))

  return { checksum, width: probed.width, height: probed.height, mimeType: probed.mimeType, altText: row.altText }
})
