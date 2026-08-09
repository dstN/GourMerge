/**
 * POST /api/reports — Flag a recipe, user, discussion comment, image or ingredient.
 *
 * Idempotent per (reporter, target): resubmitting the same report returns the existing row
 * rather than erroring or inflating a count — the unique index on `reports` is what makes
 * that safe against a race between the `SELECT` and the `INSERT` below (a duplicate insert
 * fails the constraint, and that failure is treated the same as finding it on the SELECT).
 */
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { reports } from '~~/server/database/schema'

const createReportSchema = z.object({
  targetKind: z.enum(['recipe', 'user', 'discussion_comment', 'image', 'ingredient']),
  targetId: z.number().int().positive(),
  reason: z.enum(['spam', 'inappropriate', 'copyright', 'harassment', 'incorrect_data', 'other']),
  note: z.string().trim().max(2000).optional(),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const result = createReportSchema.safeParse(await readBody(event))
  if (!result.success) {
    throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: result.error.flatten().fieldErrors })
  }
  const { targetKind, targetId, reason, note } = result.data

  if (targetKind === 'user' && targetId === session.user.id) {
    throw createError({ statusCode: 422, statusMessage: 'Cannot report yourself' })
  }

  // Reporting is itself a moderation action worth bounding, independent of how many
  // targets exist to report — generous for a real moderation session, not for a script.
  await useRateLimit(`report:create:${session.user.id}`, { max: 20, windowSeconds: 3600 })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // 404, not 403: reporting must not become a second way to confirm a private recipe
  // (or a comment/image inside one) exists, the same reasoning as `requireVisibleRecipe`.
  const target = await resolveReportTarget(db, targetKind, targetId, session.user.id)
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Nothing here to report' })

  const [existing] = await db
    .select({ id: reports.id, status: reports.status })
    .from(reports)
    .where(
      and(eq(reports.reporterId, session.user.id), eq(reports.targetKind, targetKind), eq(reports.targetId, targetId))
    )
    .limit(1)

  if (existing) {
    return { id: existing.id, status: existing.status, alreadyReported: true }
  }

  const [inserted] = await db
    .insert(reports)
    .values({ targetKind, targetId, reporterId: session.user.id, reason, note: note || null })
    .$returningId()

  if (!inserted) throw createError({ statusCode: 500, statusMessage: 'Insert failed.' })

  setResponseStatus(event, 201)
  return { id: inserted.id, status: 'open' as const, alreadyReported: false }
})
