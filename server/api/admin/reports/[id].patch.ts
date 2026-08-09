/**
 * PATCH /api/admin/reports/:id — Mark a report actioned or dismissed.
 *
 * There is no "reopen" — once an admin has looked at it, it stays looked-at. If the same
 * target gets reported again later, the unique index means that is a different row anyway.
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { reports } from '~~/server/database/schema'

const patchSchema = z.object({ status: z.enum(['actioned', 'dismissed']) })

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: 'Invalid report id' })

  const result = patchSchema.safeParse(await readBody(event))
  if (!result.success) throw createError({ statusCode: 422, statusMessage: 'Validation failed' })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [existing] = await db.select({ id: reports.id }).from(reports).where(eq(reports.id, id)).limit(1)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Report not found' })

  await db.update(reports).set({ status: result.data.status }).where(eq(reports.id, id))

  return { success: true }
})
