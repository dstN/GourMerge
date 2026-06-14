/**
 * GET /api/recipes/:id/commits — Get commit history for a branch
 *
 * Query params:
 * - branchId (required): which branch to list commits for
 */
import { eq, desc } from 'drizzle-orm'
import { recipeCommits, users } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const recipeId = Number(getRouterParam(event, 'id'))
  const query = getQuery(event)
  const branchId = Number(query.branchId)

  if (isNaN(recipeId) || isNaN(branchId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid parameters' })
  }

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const commits = await db
    .select({
      id: recipeCommits.id,
      message: recipeCommits.message,
      parentCommitId: recipeCommits.parentCommitId,
      createdAt: recipeCommits.createdAt,
      author: {
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(recipeCommits)
    .innerJoin(users, eq(recipeCommits.authorId, users.id))
    .where(eq(recipeCommits.branchId, branchId))
    .orderBy(desc(recipeCommits.createdAt))
    .limit(50)

  return commits
})
