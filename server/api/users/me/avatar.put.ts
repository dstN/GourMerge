/**
 * PUT /api/users/me/avatar — set (or replace) the caller's profile picture.
 *
 * Self only — there is no `:username` in the path on purpose, so this can never become an
 * "upload a photo for any account" endpoint by a routing mistake. One row per user, enforced
 * by the UNIQUE index on `user_avatars.user_id` and by upserting rather than inserting.
 *
 * ## The crop happens before this endpoint ever sees the bytes
 *
 * `AvatarCropper.vue` always exports a square canvas — that is what "crop" means here, and
 * it is done client-side for the same reason `imageResize.ts` downscales client-side (see
 * that file): no image decoder on a Passenger worker. This handler still checks squareness
 * on the sniffed dimensions rather than trusting it, because a direct API caller skips the
 * cropper entirely and the stored invariant ("`edge` is one number, width equals height")
 * has to hold regardless of who is calling.
 *
 * Everything else — the early `Content-Length` guard, the header-sniff instead of trusting
 * the part's own Content-Type, re-encoding for storage and checking the cap on what that
 * re-encode actually produced — mirrors `recipes/[id]/image.put.ts`; see that file for why
 * each of those exists.
 */
import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { userAvatars, users } from '~~/server/database/schema'

/**
 * On the wire. The cropper exports a fixed-size square canvas (well under this), so this
 * ceiling only matters for a client that skipped it — a direct API call with an original
 * photo.
 */
const MAX_UPLOAD_BYTES = 512 * 1024

/**
 * The limit that actually means something — see `MAX_STORED_BYTES` in
 * `recipes/[id]/image.put.ts` for why it is the stored size and not the wire size, and why
 * a `MEDIUMBLOB` column makes that the same thing as `Buffer.length`.
 */
const MAX_STORED_BYTES = 512 * 1024
/** Below this it is a smear of pixels in a header-sized circle, not a face. */
const MIN_EDGE_PX = 64
/** Above this someone uploaded a poster and asked us to store it as an avatar. */
const MAX_EDGE_PX = 4000
/** Longest edge kept for storage. A profile picture is never shown larger than this. */
const AVATAR_MAX_EDGE = 512

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const declared = Number(getRequestHeader(event, 'content-length'))
  if (!Number.isFinite(declared) || declared <= 0) {
    setResponseHeader(event, 'Connection', 'close')
    throw createError({ statusCode: 411, statusMessage: 'Content-Length required' })
  }
  if (declared > MAX_UPLOAD_BYTES) {
    setResponseHeader(event, 'Connection', 'close')
    throw createError({ statusCode: 413, statusMessage: 'Image too large' })
  }

  await useRateLimit(`user:avatar:${session.user.id}`, { max: 10, windowSeconds: 600 })

  const parts = await readMultipartFormData(event)
  const filePart = parts?.find((p) => p.name === 'file' && p.filename !== undefined)
  if (!filePart?.data?.length) throw createError({ statusCode: 422, statusMessage: 'No image supplied' })
  if (filePart.data.length > MAX_UPLOAD_BYTES) throw createError({ statusCode: 413, statusMessage: 'Image too large' })

  // Sniffed from the bytes; the part's own Content-Type is discarded (see imageProbe.ts).
  const probed = probeImage(filePart.data)
  if (!probed) {
    throw createError({ statusCode: 415, statusMessage: 'Unsupported image format — use JPEG, PNG or WebP' })
  }
  if (probed.width !== probed.height) {
    throw createError({ statusCode: 422, statusMessage: 'Avatar image must be square — crop it first' })
  }
  if (probed.width < MIN_EDGE_PX || probed.width > MAX_EDGE_PX) {
    throw createError({ statusCode: 422, statusMessage: 'Image dimensions out of range' })
  }

  /**
   * Re-encoded to WebP, capped at a much smaller edge than a recipe photo — see
   * `imageEncode.ts` for the fail-open behaviour this shares with that path. The square
   * check above already ran on the *input* dimensions, so even a fail-open (original bytes,
   * untouched) keeps the stored image square; `resize({width, height, fit: 'inside'})` on a
   * square input cannot produce a non-square output either.
   */
  const encoded = await reencodeToWebp(filePart.data, probed, { maxEdge: AVATAR_MAX_EDGE })

  if (encoded.data.length > MAX_STORED_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Image too large' })
  }

  const checksum = createHash('sha256').update(encoded.data).digest('hex')

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const row = {
    userId: session.user.id,
    mimeType: encoded.mimeType,
    edge: encoded.width,
    byteSize: encoded.data.length,
    checksum,
    data: encoded.data,
  }

  await db
    .insert(userAvatars)
    .values(row)
    .onDuplicateKeyUpdate({
      set: {
        mimeType: row.mimeType,
        edge: row.edge,
        byteSize: row.byteSize,
        checksum: row.checksum,
        data: row.data,
      },
    })

  // `users.avatar_url` keeps its existing meaning — "where to fetch this user's picture" —
  // so every component that already renders it (UserAvatar.vue, API payloads) picks this up
  // untouched. Content-addressed: a later replacement gets a new checksum and therefore a
  // new URL, so caches never need to be told anything changed.
  const avatarUrl = `/api/users/${session.user.username}/avatar-image?v=${checksum}`
  await db.update(users).set({ avatarUrl }).where(eq(users.id, session.user.id))

  // Read on every authenticated request via the session cookie, not the DB row — must be
  // updated here too, or the new picture stays invisible to its own owner until next login.
  await setUserSession(event, { ...session, user: { ...session.user, avatarUrl } })

  return {
    avatarUrl,
    checksum,
    edge: encoded.width,
    mimeType: encoded.mimeType,
    byteSize: encoded.data.length,
    recompressed: encoded.recompressed,
  }
})
