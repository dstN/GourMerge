/**
 * The final step of every successful login, in one place.
 *
 * Two callers reach it: the password-only path (`/auth/login`) and the second-factor
 * path (`/auth/login-2fa`). Keeping it here means the session shape and — critically
 * — the `last_login_at` write cannot drift between them. Forgetting the timestamp on
 * one path would let an active 2FA user drift toward inactivity deletion.
 */
import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { users } from '~~/server/database/schema'

interface LoginUser {
  id: number
  username: string
  displayName: string | null
  email: string
  avatarUrl: string | null
}

export async function completeLogin(event: H3Event, user: LoginUser): Promise<void> {
  await setUserSession(event, {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
    loggedInAt: new Date().toISOString(),
    secure: {
      userId: user.id,
    },
  })

  const db = useDrizzle()
  if (!db) return

  /**
   * Stamp the inactivity clock and clear any pending warnings.
   *
   * A login is the ONLY thing that resets this — a warning email deliberately does
   * not, or the notice would keep extending the very retention period it is warning
   * about. Clearing the three notice columns means a user who returns after the
   * 6-month warning starts a clean 3-year cycle and will be warned again from
   * scratch if they go quiet once more.
   */
  await db
    .update(users)
    .set({
      lastLoginAt: new Date(),
      inactivityNotice6mAt: null,
      inactivityNotice4wAt: null,
      inactivityNotice24hAt: null,
    })
    .where(eq(users.id, user.id))
}
