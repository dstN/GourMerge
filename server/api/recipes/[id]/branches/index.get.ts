/**
 * GET /api/recipes/:id/branches — List all branches for a recipe
 */
import { eq } from 'drizzle-orm'
import { recipeBranches } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const recipeId = Number(getRouterParam(event, 'id'))
  if (isNaN(recipeId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid recipe ID' })
  }

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const branches = await db
    .select({
      id: recipeBranches.id,
      name: recipeBranches.name,
      isDefault: recipeBranches.isDefault,
      headCommitId: recipeBranches.headCommitId,
      createdAt: recipeBranches.createdAt,
    })
    .from(recipeBranches)
    .where(eq(recipeBranches.recipeId, recipeId))

  return branches
})
