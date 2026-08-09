/**
 * DELETE /api/recipes/:id — Delete a recipe and all related data
 *
 * Cascade behaviour (via FK constraints):
 *   recipes → recipe_branches → recipe_commits → commit_ingredients, commit_steps
 *   recipes → recipe_tags, recipe_stars
 *   recipes → gourmerge_requests (recipe_id) → gm_request_comments
 *
 * Two FK relations use NO ACTION (= RESTRICT in MySQL) and must be
 * handled explicitly before the main delete:
 *   1. recipes.forked_from_recipe_id  — forks that reference this recipe as their origin
 *   2. gourmerge_requests.source_recipe_id / source_branch_id / target_branch_id
 *      — cross-recipe GMRs that reference branches of this recipe
 */
import { eq, inArray, or } from 'drizzle-orm'
import { recipes, recipeBranches, gourmergeRequests, recipeDiscussionComments, recipeDiscussions } from '~~/server/database/schema'

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

  await useRateLimit(`recipe:delete:${session.user.id}`, { max: 10, windowSeconds: 600 })

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

  // Reports address a comment by its own id, not by the recipe it lives on — gathered
  // before the delete below removes them (via CASCADE through recipe_discussions), since
  // there is nothing left to join against afterwards.
  const commentIds = (
    await db
      .select({ id: recipeDiscussionComments.id })
      .from(recipeDiscussionComments)
      .innerJoin(recipeDiscussions, eq(recipeDiscussionComments.discussionId, recipeDiscussions.id))
      .where(eq(recipeDiscussions.recipeId, id))
  ).map((c) => c.id)

  // ── Delete (remaining cascades via foreign keys) ─────────────
  await db.delete(recipes).where(eq(recipes.id, id))

  // Deleting the recipe is the moderation response for every report against it, its photo,
  // and every comment that went with it — best-effort, never blocks the response above.
  await closeReportsForTarget(db, 'recipe', id)
  await closeReportsForTarget(db, 'image', id)
  await Promise.all(commentIds.map((commentId) => closeReportsForTarget(db, 'discussion_comment', commentId)))

  return { success: true }
})
