/**
 * GET /api/users/:username/stats — contribution graph, most-forked recipe, activity counts
 *
 * A separate endpoint rather than folded into `GET /api/users/:username`: this is
 * genuinely new, heavier aggregate data that only the profile page needs — the dashboard's
 * "reuse already-fetched data" convention is about not re-fetching the SAME data twice,
 * not about never adding a second endpoint for a second concern.
 */
import { eq } from 'drizzle-orm'
import { users } from '~~/server/database/schema'
import { getProfileStats } from '~~/server/utils/profileStats'

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')
  if (!username) throw createError({ statusCode: 400, statusMessage: 'Username required' })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1)
  if (!user) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  const session = await getUserSession(event)
  const viewerId = session?.user?.id ?? null

  return getProfileStats(db, user.id, viewerId)
})
