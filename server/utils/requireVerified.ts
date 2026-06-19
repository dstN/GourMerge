/**
 * Guard that requires the current session user to have a verified email.
 * Controlled by the REQUIRE_EMAIL_VERIFICATION env var (defaults to false in dev).
 *
 * Usage:
 *   await requireVerifiedUser(event)
 */
import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { users } from '~~/server/database/schema'

export async function requireVerifiedUser(event: H3Event): Promise<void> {
  if (process.env.REQUIRE_EMAIL_VERIFICATION !== 'true') return

  const session = await getUserSession(event)
  if (!session?.user?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized.' })

  const db = useDrizzle()
  if (!db) return // fail open on startup — don't block if DB not ready yet

  const [user] = await db
    .select({ emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)

  if (!user?.emailVerifiedAt) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Email not verified. Please verify your email to perform this action.',
    })
  }
}
