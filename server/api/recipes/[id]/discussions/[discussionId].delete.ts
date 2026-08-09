/**
 * DELETE /api/recipes/:id/discussions/:discussionId
 *
 * Author or recipe owner. The owner needs it because this is the one place strangers can
 * write onto their page — without a removal path, moderation would mean deleting the
 * recipe. Replies go with the thread via `ON DELETE CASCADE`.
 */
import { and, eq } from 'drizzle-orm'
import { recipeDiscussions } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const recipeId = Number(getRouterParam(event, 'id'))
  const discussionId = Number(getRouterParam(event, 'discussionId'))
  if (!Number.isInteger(discussionId) || discussionId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid discussion id' })
  }

  const recipe = await requireVisibleRecipe(event, recipeId)

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [thread] = await db
    .select({ id: recipeDiscussions.id, authorId: recipeDiscussions.authorId })
    .from(recipeDiscussions)
    .where(and(eq(recipeDiscussions.id, discussionId), eq(recipeDiscussions.recipeId, recipe.id)))
    .limit(1)

  if (!thread) throw createError({ statusCode: 404, statusMessage: 'Discussion not found' })
  if (thread.authorId !== session.user.id && !recipe.isOwner) {
    throw createError({ statusCode: 403, statusMessage: 'Not allowed' })
  }

  await db.delete(recipeDiscussions).where(eq(recipeDiscussions.id, thread.id))
  return { success: true }
})
