/**
 * GET /api/recipes/:id/gourmerge-requests — List GourMerge Requests for a recipe
 */
import { eq, and, desc } from 'drizzle-orm'
import { recipes, gourmergeRequests, users } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const recipeId = Number(getRouterParam(event, 'id'))
  if (isNaN(recipeId)) throw createError({ statusCode: 400, statusMessage: 'Invalid recipe ID' })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })
  const session = await getUserSession(event)

  const [recipe] = await db
    .select({ ownerId: recipes.ownerId, visibility: recipes.visibility })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1)

  if (!recipe) throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
  if (recipe.visibility === 'private' && recipe.ownerId !== session?.user?.id) {
    throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
  }

  const query = getQuery(event)
  const status = query.status as string | undefined
  const conditions = [eq(gourmergeRequests.recipeId, recipeId)]
  if (status && ['open', 'closed', 'merged', 'draft'].includes(status)) {
    conditions.push(eq(gourmergeRequests.status, status as 'open' | 'closed' | 'merged' | 'draft'))
  }

  const rows = await db
    .select({
      id: gourmergeRequests.id,
      title: gourmergeRequests.title,
      status: gourmergeRequests.status,
      authorId: gourmergeRequests.authorId,
      sourceBranchId: gourmergeRequests.sourceBranchId,
      targetBranchId: gourmergeRequests.targetBranchId,
      sourceRecipeId: gourmergeRequests.sourceRecipeId,
      createdAt: gourmergeRequests.createdAt,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
    })
    .from(gourmergeRequests)
    .innerJoin(users, eq(gourmergeRequests.authorId, users.id))
    .where(conditions.length === 1 ? conditions[0]! : and(...conditions))
    .orderBy(desc(gourmergeRequests.createdAt))
    .limit(50)

  return rows
})
