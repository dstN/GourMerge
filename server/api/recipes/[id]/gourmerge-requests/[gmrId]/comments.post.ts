/**
 * POST /api/recipes/:id/gourmerge-requests/:gmrId/comments — Add a comment
 */
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { recipes, gourmergeRequests, gourmergeRequestComments, users } from '~~/server/database/schema'

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

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

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
    .select({
      id: gourmergeRequests.id,
      status: gourmergeRequests.status,
      authorId: gourmergeRequests.authorId,
      authorMutes: users.notificationMutes,
    })
    .from(gourmergeRequests)
    .innerJoin(users, eq(users.id, gourmergeRequests.authorId))
    .where(and(eq(gourmergeRequests.id, gmrId), eq(gourmergeRequests.recipeId, recipeId)))
    .limit(1)

  if (!gmr) throw createError({ statusCode: 404, statusMessage: 'GourMerge Request not found' })
  if (gmr.status === 'merged' || gmr.status === 'closed') {
    throw createError({ statusCode: 422, statusMessage: 'Cannot comment on a closed or merged GourMerge Request' })
  }

  await useRateLimit(`gmr:comment:${session.user.id}`, { max: 30, windowSeconds: 600 })

  const insertedId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(gourmergeRequestComments)
      .values({
        gourmergeRequestId: gmrId,
        authorId: session.user.id,
        body: result.data.body,
      })
      .$returningId()

    if (!inserted) throw createError({ statusCode: 500, statusMessage: 'Insert failed.' })

    // Recipient is the GMR's author, not necessarily the recipe owner — same reasoning
    // as a discussion reply's recipient.
    await createNotification(tx, {
      recipientId: gmr.authorId,
      actorId: session.user.id,
      kind: 'gmr_comment',
      recipeId,
      targetKind: 'gmr',
      targetId: gmr.id,
      recipientMutes: gmr.authorMutes,
    })

    return inserted.id
  })

  setResponseStatus(event, 201)
  return { id: insertedId }
})
