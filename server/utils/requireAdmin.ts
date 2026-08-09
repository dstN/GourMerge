/**
 * Guard for `/api/admin/*`. Always re-checks the database — `isAdmin` is deliberately not
 * carried in the session the way `emailVerified` is: that field is documented as
 * "for display only, never a security boundary" precisely so it never gets reused as one
 * later, and admin access is exactly the case where that mistake would matter. There is no
 * self-service promotion path either, so a stale session cannot be leveraged by anything —
 * only `UPDATE users SET is_admin = 1` by whoever already has database access can grant it.
 *
 * Usage:
 *   const adminId = await requireAdmin(event)
 */
import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { users } from '~~/server/database/schema'

export async function requireAdmin(event: H3Event): Promise<number> {
  const session = await requireUserSession(event)

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [user] = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, session.user.id)).limit(1)

  if (!user?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  }

  return session.user.id
}
