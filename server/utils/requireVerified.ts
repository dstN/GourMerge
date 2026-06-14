/**
 * Guard that requires the current session user to have a verified email.
 * Controlled by the REQUIRE_EMAIL_VERIFICATION env var (defaults to false in dev).
 *
 * Usage:
 *   await requireVerifiedUser(event)
 */
import { eq } from 'drizzle-orm'
import { users } from '~~/server/database/schema'

export async function requireVerifiedUser(event: Parameters<typeof defineEventHandler>[0] extends (ev: infer E) => any ? E : never): Promise<void> {
  if (process.env.REQUIRE_EMAIL_VERIFICATION !== 'true') return

  const session = await getUserSession(event)
  if (!session?.user?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized.' })

  const db = useDrizzle()
  const [user] = await db
    .select({ emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)

  if (!user?.emailVerifiedAt) {
    throw createError({ statusCode: 403, statusMessage: 'Email not verified. Please verify your email to perform this action.' })
  }
}
