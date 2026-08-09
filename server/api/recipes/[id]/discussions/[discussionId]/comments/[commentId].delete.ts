/**
 * DELETE /api/recipes/:id/discussions/:discussionId/comments/:commentId
 *
 * Author or recipe owner — same moderation reasoning as deleting a whole thread.
 */
import { and, eq } from 'drizzle-orm'
import { recipeDiscussions, recipeDiscussionComments } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const recipeId = Number(getRouterParam(event, 'id'))
  const discussionId = Number(getRouterParam(event, 'discussionId'))
  const commentId = Number(getRouterParam(event, 'commentId'))
  if (!Number.isInteger(discussionId) || discussionId <= 0 || !Number.isInteger(commentId) || commentId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid parameters' })
  }

  const recipe = await requireVisibleRecipe(event, recipeId)

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // One join, so a comment id can only be reached through a thread that belongs to this
  // recipe — the id alone is not enough.
  const [comment] = await db
    .select({ id: recipeDiscussionComments.id, authorId: recipeDiscussionComments.authorId })
    .from(recipeDiscussionComments)
    .innerJoin(recipeDiscussions, eq(recipeDiscussionComments.discussionId, recipeDiscussions.id))
    .where(
      and(
        eq(recipeDiscussionComments.id, commentId),
        eq(recipeDiscussions.id, discussionId),
        eq(recipeDiscussions.recipeId, recipe.id)
      )
    )
    .limit(1)

  if (!comment) throw createError({ statusCode: 404, statusMessage: 'Comment not found' })
  if (comment.authorId !== session.user.id && !recipe.isOwner) {
    throw createError({ statusCode: 403, statusMessage: 'Not allowed' })
  }

  await useRateLimit(`discussion:comment-delete:${session.user.id}`, { max: 30, windowSeconds: 600 })

  await db.delete(recipeDiscussionComments).where(eq(recipeDiscussionComments.id, comment.id))
  await closeReportsForTarget(db, 'discussion_comment', comment.id)
  return { success: true }
})
