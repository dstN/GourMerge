/**
 * PATCH /api/users/me — Update current user's profile settings
 *
 * `avatarUrl` is deliberately not a field here — it used to accept any URL, which meant a
 * profile picture could point at an arbitrary third-party origin (mixed content, hotlinking,
 * a link that silently changes what it serves later). `PUT/DELETE /api/users/me/avatar` are
 * now the only writers of that column, and they always set it to our own content-addressed
 * delivery URL. See the `user_avatars` table comment in schema.ts.
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { users } from '~~/server/database/schema'

const updateSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional().nullable(),
  preferredLocale: z.enum(['de', 'en', 'fr', 'it']).optional(),
  preferredMeasurementSystem: z.enum(['metric', 'imperial']).optional(),
  onboardingCompletedAt: z.string().datetime().optional().nullable(),
  tourDismissed: z.boolean().optional(),
  hasFinishedTour: z.boolean().optional(),
  completedTours: z.array(z.string()).optional(),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const body = await readBody(event)

  const result = updateSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Validation failed',
      data: result.error.flatten().fieldErrors,
    })
  }

  await useRateLimit(`user:update:${session.user.id}`, { max: 60, windowSeconds: 600 })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })
  const updates: Partial<typeof users.$inferInsert> = {}

  if (result.data.displayName !== undefined) updates.displayName = result.data.displayName
  if (result.data.bio !== undefined) updates.bio = result.data.bio ?? undefined
  if (result.data.preferredLocale !== undefined) updates.preferredLocale = result.data.preferredLocale
  if (result.data.preferredMeasurementSystem !== undefined)
    updates.preferredMeasurementSystem = result.data.preferredMeasurementSystem
  if (result.data.onboardingCompletedAt !== undefined) {
    updates.onboardingCompletedAt = result.data.onboardingCompletedAt
      ? new Date(result.data.onboardingCompletedAt)
      : undefined
  }
  if (result.data.tourDismissed !== undefined) updates.tourDismissed = result.data.tourDismissed
  if (result.data.hasFinishedTour !== undefined) updates.hasFinishedTour = result.data.hasFinishedTour
  if (result.data.completedTours !== undefined) updates.completedTours = result.data.completedTours

  if (Object.keys(updates).length === 0) {
    return { success: true }
  }

  await db.update(users).set(updates).where(eq(users.id, session.user.id))

  // useUserSession() reads the session cookie, not the DB row — must update it here too, or
  // these fields stay stale until re-login. Spreads `session` (not just `user`): setUserSession
  // replaces rather than deep-merges, so passing only `user` would drop `loggedInAt`.
  await setUserSession(event, {
    ...session,
    user: {
      ...session.user,
      ...(result.data.displayName !== undefined && { displayName: result.data.displayName }),
      ...(result.data.onboardingCompletedAt !== undefined && {
        onboardingCompletedAt: result.data.onboardingCompletedAt,
      }),
      ...(result.data.tourDismissed !== undefined && { tourDismissed: result.data.tourDismissed }),
      ...(result.data.hasFinishedTour !== undefined && { hasFinishedTour: result.data.hasFinishedTour }),
      ...(result.data.completedTours !== undefined && { completedTours: result.data.completedTours }),
    },
  })

  return { success: true }
})
