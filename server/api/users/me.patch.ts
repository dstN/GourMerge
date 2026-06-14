/**
 * PATCH /api/users/me — Update current user's profile settings
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { users } from '~~/server/database/schema'

const updateSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional().nullable(),
  avatarUrl: z.string().url().max(500).optional().nullable(),
  preferredLocale: z.enum(['de', 'en']).optional(),
  preferredMeasurementSystem: z.enum(['metric', 'imperial']).optional(),
  onboardingCompletedAt: z.string().datetime().optional().nullable(),
  tourDismissed: z.boolean().optional(),
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

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })
  const updates: Partial<typeof users.$inferInsert> = {}

  if (result.data.displayName !== undefined) updates.displayName = result.data.displayName
  if (result.data.bio !== undefined) updates.bio = result.data.bio ?? undefined
  if (result.data.avatarUrl !== undefined) updates.avatarUrl = result.data.avatarUrl ?? undefined
  if (result.data.preferredLocale !== undefined) updates.preferredLocale = result.data.preferredLocale
  if (result.data.preferredMeasurementSystem !== undefined) updates.preferredMeasurementSystem = result.data.preferredMeasurementSystem
  if (result.data.onboardingCompletedAt !== undefined) {
    updates.onboardingCompletedAt = result.data.onboardingCompletedAt
      ? new Date(result.data.onboardingCompletedAt)
      : undefined
  }
  if (result.data.tourDismissed !== undefined) updates.tourDismissed = result.data.tourDismissed

  if (Object.keys(updates).length === 0) {
    return { success: true }
  }

  await db.update(users).set(updates).where(eq(users.id, session.user.id))

  return { success: true }
})
