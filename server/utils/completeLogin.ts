// Shared by both login paths (password-only and 2FA) so the session shape and the
// last_login_at write can't drift between them — missing it on one path would let an
// active 2FA user drift toward inactivity deletion.
import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { users } from '~~/server/database/schema'
import { isEmailVerificationRequired } from './emailVerification'

interface LoginUser {
  id: number
  username: string
  displayName: string | null
  email: string
  avatarUrl: string | null
  emailVerifiedAt: Date | null
}

export async function completeLogin(event: H3Event, user: LoginUser): Promise<void> {
  const db = useDrizzle()

  // Onboarding state lives in the session (useOnboarding/useProductTour read it client-side),
  // so login — the one place every session starts fresh — must read it from the DB here.
  const [onboarding] = db
    ? await db
        .select({
          onboardingCompletedAt: users.onboardingCompletedAt,
          tourDismissed: users.tourDismissed,
          hasFinishedTour: users.hasFinishedTour,
          completedTours: users.completedTours,
        })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1)
    : []

  await setUserSession(event, {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      // Session copy avoids an extra request per page for the unverified banner; never trusted
      // server-side — every gate re-reads the column via requireVerifiedUser.
      emailVerified: Boolean(user.emailVerifiedAt),
      onboardingCompletedAt: onboarding?.onboardingCompletedAt?.toISOString() ?? null,
      tourDismissed: onboarding?.tourDismissed ?? false,
      hasFinishedTour: onboarding?.hasFinishedTour ?? false,
      completedTours: onboarding?.completedTours ?? null,
    },
    loggedInAt: new Date().toISOString(),
    emailVerificationRequired: isEmailVerificationRequired(),
    secure: {
      userId: user.id,
    },
  })

  if (!db) return

  // Only a login resets the inactivity clock — a warning email must not, or it would keep
  // extending the retention period it's warning about.
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
