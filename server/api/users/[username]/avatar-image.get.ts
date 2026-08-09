/**
 * GET /api/users/:username/avatar-image — deliver an uploaded profile picture.
 *
 * Only reachable once a user has actually uploaded one; `users.avatar_url` is what points
 * here, and it is `null` until then. `CommonUserAvatar.vue` falls back to the generated
 * identicon-QR badge at `/api/users/:username/avatar` (a different endpoint, no hyphen) in
 * that case — this route 404s rather than serving a placeholder, so a stale cached `<img>`
 * fails loudly instead of silently drawing the wrong person's mark.
 *
 * A profile picture has no privacy tier of its own — a profile page is always public — so
 * unlike the recipe photo this is `public, immutable` unconditionally. The URL is
 * content-addressed (`?v=<checksum>`), so "immutable forever" is true by construction: a
 * replaced picture is a different checksum and therefore a different URL.
 */
import { eq } from 'drizzle-orm'
import { userAvatars, users } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')
  if (!username) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [avatar] = await db
    .select({
      mimeType: userAvatars.mimeType,
      checksum: userAvatars.checksum,
      data: userAvatars.data,
    })
    .from(userAvatars)
    .innerJoin(users, eq(users.id, userAvatars.userId))
    .where(eq(users.username, username))
    .limit(1)

  if (!avatar) throw createError({ statusCode: 404, statusMessage: 'No avatar' })

  const etag = `"${avatar.checksum}"`
  setResponseHeader(event, 'ETag', etag)
  setResponseHeader(event, 'Content-Type', avatar.mimeType)
  setResponseHeader(event, 'Content-Disposition', `inline; filename="avatar-${username}.webp"`)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')

  if (getRequestHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304)
    return null
  }

  // `Content-Length` left to Nitro, derived from the Buffer it actually sends — see the
  // matching note in `recipes/[id]/image.get.ts`.
  return avatar.data
})
