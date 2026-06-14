/**
 * DELETE /api/recipes/:id/branches/:branchId — Delete a branch
 *
 * Cannot delete the default (main) branch.
 */
import { eq, and } from 'drizzle-orm'
import { recipes, recipeBranches } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const recipeId = Number(getRouterParam(event, 'id'))
  const branchId = Number(getRouterParam(event, 'branchId'))

  if (isNaN(recipeId) || isNaN(branchId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid parameters' })
  }

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // ── Verify ownership ───────────────────────────────────────
  const [recipe] = await db
    .select({ ownerId: recipes.ownerId })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1)

  if (!recipe || recipe.ownerId !== session.user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  // ── Get branch ─────────────────────────────────────────────
  const [branch] = await db
    .select()
    .from(recipeBranches)
    .where(and(
      eq(recipeBranches.id, branchId),
      eq(recipeBranches.recipeId, recipeId),
    ))
    .limit(1)

  if (!branch) {
    throw createError({ statusCode: 404, statusMessage: 'Branch not found' })
  }

  if (branch.isDefault) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot delete the default branch' })
  }

  // ── Delete (cascades to commits, ingredients, steps) ───────
  await db
    .delete(recipeBranches)
    .where(eq(recipeBranches.id, branchId))

  return { success: true }
})
