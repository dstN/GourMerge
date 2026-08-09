/**
 * DELETE /api/users/me/avatar — remove the caller's uploaded profile picture.
 *
 * Falls back to the generated identicon-QR badge, same as an account that never uploaded
 * one — see `server/utils/identiconAvatar.ts`.
 *
 * ## `replaceUserSession`, not `setUserSession`
 *
 * `setUserSession` merges the given object onto the existing session with `defu`, and
 * `defu` skips any key whose new value is `null` — it exists to let a partial update omit
 * fields it does not touch, not to describe "clear this". Clearing `avatarUrl` needs the
 * literal replacement `replaceUserSession` does, or the cookie keeps the old value: the row
 * is gone and the profile page reads null from the DB, but the header's own avatar — read
 * from the session, not re-fetched — would keep showing the deleted photo until next login.
 */
import { eq } from 'drizzle-orm'
import { userAvatars, users } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  await useRateLimit(`user:avatar-delete:${session.user.id}`, { max: 10, windowSeconds: 600 })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  await db.delete(userAvatars).where(eq(userAvatars.userId, session.user.id))
  await db.update(users).set({ avatarUrl: null }).where(eq(users.id, session.user.id))

  await replaceUserSession(event, { ...session, user: { ...session.user, avatarUrl: null } })

  return { success: true }
})
