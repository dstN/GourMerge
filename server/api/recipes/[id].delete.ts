/**
 * DELETE /api/recipes/:id — Delete a recipe and all related data
 *
 * Cascade behaviour (via FK constraints):
 *   recipes → recipe_branches → recipe_commits → commit_ingredients, commit_steps
 *   recipes → recipe_tags, recipe_stars
 *   recipes → gourmerge_requests (recipe_id) → gm_request_comments
 *
 * Two FK relations use NO ACTION (= RESTRICT in MariaDB) and must be
 * handled explicitly before the main delete:
 *   1. recipes.forked_from_recipe_id  — forks that reference this recipe as their origin
 *   2. gourmerge_requests.source_recipe_id / source_branch_id / target_branch_id
 *      — cross-recipe GMRs that reference branches of this recipe
 */
import { eq, inArray, or } from 'drizzle-orm'
import { recipes, recipeBranches, gourmergeRequests } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const id = Number(getRouterParam(event, 'id'))
  if (isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid recipe ID' })
  }

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // ── Verify ownership ────────────────────────────────────────
  const [recipe] = await db.select({ ownerId: recipes.ownerId }).from(recipes).where(eq(recipes.id, id)).limit(1)

  if (!recipe) {
    throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
  }
  if (recipe.ownerId !== session.user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  // ── Pre-delete: orphan forks ────────────────────────────────
  // Forks that referenced this recipe as their origin would block deletion.
  // Clearing the pointer orphans them (they remain as standalone recipes).
  await db.update(recipes).set({ forkedFromRecipeId: null }).where(eq(recipes.forkedFromRecipeId, id))

  // ── Pre-delete: cross-recipe GMRs referencing this recipe's branches ──
  // source_branch_id / target_branch_id / source_recipe_id have NO ACTION
  // and would block the recipe_branches cascade. Delete those GMRs first.
  const branches = await db
    .select({ id: recipeBranches.id })
    .from(recipeBranches)
    .where(eq(recipeBranches.recipeId, id))

  if (branches.length > 0) {
    const branchIds = branches.map((b) => b.id)
    await db
      .delete(gourmergeRequests)
      .where(
        or(inArray(gourmergeRequests.sourceBranchId, branchIds), inArray(gourmergeRequests.targetBranchId, branchIds))
      )
  }

  // Also remove GMRs with source_recipe_id pointing here
  // (cross-recipe GMRs where this is the fork / source side)
  await db.delete(gourmergeRequests).where(eq(gourmergeRequests.sourceRecipeId, id))

  // ── Delete (remaining cascades via foreign keys) ─────────────
  await db.delete(recipes).where(eq(recipes.id, id))

  return { success: true }
})
