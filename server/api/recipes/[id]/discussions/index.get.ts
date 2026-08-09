/**
 * GET /api/recipes/:id/discussions — threads on a recipe, or on one of its commits.
 *
 * `?commitId=` selects the scope and is not optional-by-omission: absent means the
 * recipe-level threads only, `all` means every thread including commit-anchored ones
 * (used by the count badge on the recipe page). Without that distinction the recipe
 * page would list notes written about a single snapshot alongside threads about the
 * dish, which reads as noise.
 *
 * Replies come back nested. Two queries, not N+1: the thread rows, then every reply
 * belonging to that id set in one `IN (…)`.
 */
import { z } from 'zod'
import { and, eq, inArray, isNull, desc } from 'drizzle-orm'
import { recipeDiscussions, recipeDiscussionComments, users } from '~~/server/database/schema'
import type { RecipeDiscussion } from '~~/shared/types/discussion'

const querySchema = z.object({
  /** A commit id, `all`, or absent for recipe-level only. */
  commitId: z.union([z.coerce.number().int().positive(), z.literal('all')]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export default defineEventHandler(async (event): Promise<RecipeDiscussion[]> => {
  const recipeId = Number(getRouterParam(event, 'id'))
  const recipe = await requireVisibleRecipe(event, recipeId)

  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Validation failed' })
  const { commitId, limit } = parsed.data

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // A caller-supplied commit id is scoped to this recipe before it is trusted.
  const commitScope = typeof commitId === 'number' ? await requireCommitInRecipe(recipe.id, commitId) : null

  const scope =
    commitScope !== null
      ? and(eq(recipeDiscussions.recipeId, recipe.id), eq(recipeDiscussions.commitId, commitScope))
      : commitId === 'all'
        ? eq(recipeDiscussions.recipeId, recipe.id)
        : and(eq(recipeDiscussions.recipeId, recipe.id), isNull(recipeDiscussions.commitId))

  const threads = await db
    .select({
      id: recipeDiscussions.id,
      commitId: recipeDiscussions.commitId,
      title: recipeDiscussions.title,
      body: recipeDiscussions.body,
      category: recipeDiscussions.category,
      status: recipeDiscussions.status,
      createdAt: recipeDiscussions.createdAt,
      updatedAt: recipeDiscussions.updatedAt,
      authorId: recipeDiscussions.authorId,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
      authorAvatarUrl: users.avatarUrl,
    })
    .from(recipeDiscussions)
    .innerJoin(users, eq(recipeDiscussions.authorId, users.id))
    .where(scope)
    .orderBy(desc(recipeDiscussions.createdAt))
    .limit(limit)

  if (threads.length === 0) return []

  const replies = await db
    .select({
      id: recipeDiscussionComments.id,
      discussionId: recipeDiscussionComments.discussionId,
      body: recipeDiscussionComments.body,
      createdAt: recipeDiscussionComments.createdAt,
      authorId: recipeDiscussionComments.authorId,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
      authorAvatarUrl: users.avatarUrl,
    })
    .from(recipeDiscussionComments)
    .innerJoin(users, eq(recipeDiscussionComments.authorId, users.id))
    .where(
      inArray(
        recipeDiscussionComments.discussionId,
        threads.map((t) => t.id)
      )
    )
    .orderBy(recipeDiscussionComments.createdAt)

  return threads.map((thread) => ({
    ...thread,
    createdAt: String(thread.createdAt),
    updatedAt: String(thread.updatedAt),
    comments: replies
      .filter((r) => r.discussionId === thread.id)
      .map((r) => ({ ...r, createdAt: String(r.createdAt) })),
  }))
})
