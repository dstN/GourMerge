/**
 * GET /api/recipes/:id/branches — List all branches for a recipe
 *
 * The visibility check is not decoration: this used to answer for any recipe id, so the
 * branch names of a private recipe ("thanksgiving-surprise", "client-pitch") were readable
 * by anyone walking the sequential ids. Its siblings — `snapshot`, `compare`, the GourMerge
 * Request lists — all checked; this one and two others did not, which is the shape of gap a
 * per-endpoint copy of the rule produces. `requireVisibleRecipe` is the one copy now.
 */
import { eq } from 'drizzle-orm'
import { recipeBranches } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const recipeId = Number(getRouterParam(event, 'id'))
  const recipe = await requireVisibleRecipe(event, recipeId)

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
    .where(eq(recipeBranches.recipeId, recipe.id))

  return branches
})
