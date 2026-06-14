/**
 * PATCH /api/recipes/:id/gourmerge-requests/:gmrId — Update status or description
 *
 * Valid transitions:
 *   open → closed (author or recipe owner)
 *   closed → open (author or recipe owner)
 *   draft → open (author)
 * Merged GourMerge Requests are immutable.
 */
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { recipes, gourmergeRequests } from '~~/server/database/schema'

const patchSchema = z.object({
  status: z.enum(['open', 'closed', 'draft']).optional(),
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional().nullable(),
})

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['open'],
  open: ['closed'],
  closed: ['open'],
  merged: [], // immutable
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const recipeId = Number(getRouterParam(event, 'id'))
  const gmrId = Number(getRouterParam(event, 'gmrId'))
  if (isNaN(recipeId) || isNaN(gmrId)) throw createError({ statusCode: 400, statusMessage: 'Invalid parameters' })

  const body = await readBody(event)
  const result = patchSchema.safeParse(body)
  if (!result.success) throw createError({ statusCode: 422, statusMessage: 'Validation failed' })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [recipe] = await db
    .select({ ownerId: recipes.ownerId })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1)

  if (!recipe) throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })

  const [gmr] = await db
    .select()
    .from(gourmergeRequests)
    .where(and(eq(gourmergeRequests.id, gmrId), eq(gourmergeRequests.recipeId, recipeId)))
    .limit(1)

  if (!gmr) throw createError({ statusCode: 404, statusMessage: 'GourMerge Request not found' })

  const isAuthor = gmr.authorId === session.user.id
  const isOwner = recipe.ownerId === session.user.id
  if (!isAuthor && !isOwner) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const updates: Record<string, unknown> = {}

  if (result.data.status !== undefined) {
    if (gmr.status === 'merged') {
      throw createError({ statusCode: 422, statusMessage: 'Merged GourMerge Requests are immutable' })
    }
    const allowed = ALLOWED_TRANSITIONS[gmr.status] ?? []
    if (!allowed.includes(result.data.status)) {
      throw createError({ statusCode: 422, statusMessage: `Cannot transition from '${gmr.status}' to '${result.data.status}'` })
    }
    updates.status = result.data.status
  }
  if (result.data.title !== undefined) updates.title = result.data.title
  if (result.data.description !== undefined) updates.description = result.data.description ?? undefined

  if (Object.keys(updates).length === 0) return { success: true }

  await db
    .update(gourmergeRequests)
    .set(updates)
    .where(eq(gourmergeRequests.id, gmrId))

  return { success: true }
})
