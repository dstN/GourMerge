/**
 * POST /api/recipes/:id/discussions/:discussionId/comments — reply to a thread.
 *
 * A resolved thread is closed to new replies, the way a merged GourMerge Request is:
 * reopening is one click for the author or the recipe owner, and without that rule
 * "resolved" would mean nothing.
 */
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { recipeDiscussions, recipeDiscussionComments } from '~~/server/database/schema'

const commentSchema = z.object({ body: z.string().trim().min(1).max(10000) }).strict()

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  await requireVerifiedUser(event)

  const recipeId = Number(getRouterParam(event, 'id'))
  const discussionId = Number(getRouterParam(event, 'discussionId'))
  if (!Number.isInteger(discussionId) || discussionId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid discussion id' })
  }

  const recipe = await requireVisibleRecipe(event, recipeId)

  const parsed = commentSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  // 30 replies / 10 minutes per account. Higher than thread creation: replying is the
  // normal interaction, opening threads is the one worth throttling hard.
  await useRateLimit(`discussion:comment:${session.user.id}`, { max: 30, windowSeconds: 600 })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [thread] = await db
    .select({ id: recipeDiscussions.id, status: recipeDiscussions.status })
    .from(recipeDiscussions)
    .where(and(eq(recipeDiscussions.id, discussionId), eq(recipeDiscussions.recipeId, recipe.id)))
    .limit(1)

  if (!thread) throw createError({ statusCode: 404, statusMessage: 'Discussion not found' })
  if (thread.status === 'resolved') {
    throw createError({ statusCode: 422, statusMessage: 'Cannot reply to a resolved discussion' })
  }

  const [inserted] = await db
    .insert(recipeDiscussionComments)
    .values({ discussionId: thread.id, authorId: session.user.id, body: parsed.data.body })
    .$returningId()

  if (!inserted) throw createError({ statusCode: 500, statusMessage: 'Insert failed.' })

  setResponseStatus(event, 201)
  return { id: inserted.id }
})
