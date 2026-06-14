/**
 * POST /api/recipes/:id/gourmerge-requests/:gmrId/comments — Add a comment
 */
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { recipes, gourmergeRequests, gourmergeRequestComments } from '~~/server/database/schema'

const commentSchema = z.object({
  body: z.string().min(1).max(10000),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const recipeId = Number(getRouterParam(event, 'id'))
  const gmrId = Number(getRouterParam(event, 'gmrId'))
  if (isNaN(recipeId) || isNaN(gmrId)) throw createError({ statusCode: 400, statusMessage: 'Invalid parameters' })

  const body = await readBody(event)
  const result = commentSchema.safeParse(body)
  if (!result.success) throw createError({ statusCode: 422, statusMessage: 'Validation failed' })

  const db = useDrizzle()!

  const [recipe] = await db
    .select({ ownerId: recipes.ownerId, visibility: recipes.visibility })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1)

  if (!recipe) throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
  if (recipe.visibility === 'private' && recipe.ownerId !== session.user.id) {
    throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
  }

  const [gmr] = await db
    .select({ id: gourmergeRequests.id, status: gourmergeRequests.status })
    .from(gourmergeRequests)
    .where(and(eq(gourmergeRequests.id, gmrId), eq(gourmergeRequests.recipeId, recipeId)))
    .limit(1)

  if (!gmr) throw createError({ statusCode: 404, statusMessage: 'GourMerge Request not found' })
  if (gmr.status === 'merged' || gmr.status === 'closed') {
    throw createError({ statusCode: 422, statusMessage: 'Cannot comment on a closed or merged GourMerge Request' })
  }

  const [inserted] = await db
    .insert(gourmergeRequestComments)
    .values({
      gourmergeRequestId: gmrId,
      authorId: session.user.id,
      body: result.data.body,
    })
    .$returningId()

  setResponseStatus(event, 201)
  return { id: inserted.id }
})
