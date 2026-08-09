/**
 * PATCH /api/recipes/:id/discussions/:discussionId — edit the body, or resolve/reopen.
 *
 * Two different rights, deliberately not collapsed into one "can edit" check:
 *
 * - **body / title** — the author only. Nobody else may put words in someone's mouth,
 *   the recipe owner included.
 * - **status** — the author *or* the recipe owner. "Resolved" is a statement about the
 *   thread's usefulness on this recipe, which is exactly the owner's call, and it is
 *   non-destructive: the text stays and it can be reopened.
 */
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { recipeDiscussions } from '~~/server/database/schema'

const patchSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    body: z.string().trim().min(1).max(10000).optional(),
    category: z.enum(['idea', 'question', 'issue', 'praise']).optional(),
    status: z.enum(['open', 'resolved']).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' })

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const recipeId = Number(getRouterParam(event, 'id'))
  const discussionId = Number(getRouterParam(event, 'discussionId'))
  if (!Number.isInteger(discussionId) || discussionId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid discussion id' })
  }

  const recipe = await requireVisibleRecipe(event, recipeId)

  const parsed = patchSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // Scoped to the recipe, so a discussion id from another recipe cannot be reached
  // through a recipe the caller happens to own.
  const [thread] = await db
    .select({ id: recipeDiscussions.id, authorId: recipeDiscussions.authorId })
    .from(recipeDiscussions)
    .where(and(eq(recipeDiscussions.id, discussionId), eq(recipeDiscussions.recipeId, recipe.id)))
    .limit(1)

  if (!thread) throw createError({ statusCode: 404, statusMessage: 'Discussion not found' })

  const isAuthor = thread.authorId === session.user.id
  const { title, body, category, status } = parsed.data

  if ((title !== undefined || body !== undefined || category !== undefined) && !isAuthor) {
    throw createError({ statusCode: 403, statusMessage: 'Only the author can edit a discussion' })
  }
  if (status !== undefined && !isAuthor && !recipe.isOwner) {
    throw createError({ statusCode: 403, statusMessage: 'Only the author or the recipe owner can change the status' })
  }

  await useRateLimit(`discussion:update:${session.user.id}`, { max: 30, windowSeconds: 600 })

  await db
    .update(recipeDiscussions)
    .set({
      ...(title !== undefined && { title }),
      ...(body !== undefined && { body }),
      ...(category !== undefined && { category }),
      ...(status !== undefined && { status }),
    })
    .where(eq(recipeDiscussions.id, thread.id))

  return { success: true }
})
