/**
 * GET /api/auth/passkeys — the viewer's own passkeys.
 *
 * Returns no key material: the public key is useless to the client, and the credential
 * id is only needed as an opaque handle for rename/delete.
 */
import { desc, eq } from 'drizzle-orm'
import { userPasskeys } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const rows = await db
    .select({
      id: userPasskeys.id,
      name: userPasskeys.name,
      backedUp: userPasskeys.backedUp,
      lastUsedAt: userPasskeys.lastUsedAt,
      createdAt: userPasskeys.createdAt,
    })
    .from(userPasskeys)
    .where(eq(userPasskeys.userId, session.user.id))
    .orderBy(desc(userPasskeys.createdAt))

  return { passkeys: rows }
})
