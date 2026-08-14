/**
 * GET /api/users/:username/collections — A user's collections (list-page data source)
 *
 * Same own-vs-public split as `GET /api/users/:username` — the profile owner sees every
 * collection they have, everyone else sees only the public ones.
 */
import { eq, and, desc } from 'drizzle-orm'
import { users, collections } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')
  if (!username) throw createError({ statusCode: 400, statusMessage: 'Username required' })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1)
  if (!user) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  const session = await getUserSession(event)
  const isOwnProfile = session?.user?.id === user.id

  const rows = await db
    .select({
      id: collections.id,
      title: collections.title,
      slug: collections.slug,
      description: collections.description,
      visibility: collections.visibility,
      createdAt: collections.createdAt,
    })
    .from(collections)
    .where(
      isOwnProfile
        ? eq(collections.ownerId, user.id)
        : and(eq(collections.ownerId, user.id), eq(collections.visibility, 'public'))
    )
    .orderBy(desc(collections.updatedAt))
    .limit(50)

  return { collections: rows, isOwnProfile }
})
