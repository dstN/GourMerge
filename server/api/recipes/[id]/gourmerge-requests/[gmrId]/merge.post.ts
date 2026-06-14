/**
 * POST /api/recipes/:id/gourmerge-requests/:gmrId/merge — Execute the merge
 *
 * Only the target recipe owner can merge. Must be status=open, no conflicts.
 *
 * Transaction:
 *   1. Find base commit (common ancestor — walk parentCommitId from both branch heads)
 *   2. Load base/source/target snapshots
 *   3. Run three-way merge; abort on conflicts
 *   4. Insert merge commit on target branch
 *   5. Insert merged ingredients + steps
 *   6. Advance target branch head to merge commit
 *   7. Set GourMerge Request status = 'merged'
 */
import { eq, and, sql } from 'drizzle-orm'
import {
  recipes,
  recipeBranches,
  recipeCommits,
  recipeCommitIngredients,
  recipeCommitSteps,
  ingredients as ingredientsTable,
  gourmergeRequests,
} from '~~/server/database/schema'
import { threeWayMerge } from '~~/server/utils/merge'
import type { MergeSnapshot } from '~~/server/utils/merge'

const MAX_ANCESTOR_WALK = 100

async function loadSnapshot(db: ReturnType<typeof useDrizzle>, headCommitId: number | null): Promise<MergeSnapshot> {
  if (!headCommitId || !db) return { ingredients: [], steps: [] }
  const [ings, steps] = await Promise.all([
    db
      .select({
        ingredientId: recipeCommitIngredients.ingredientId,
        ingredientName: ingredientsTable.name,
        quantity: recipeCommitIngredients.quantity,
        unit: recipeCommitIngredients.unit,
        notes: recipeCommitIngredients.notes,
        sortOrder: recipeCommitIngredients.sortOrder,
      })
      .from(recipeCommitIngredients)
      .innerJoin(ingredientsTable, eq(recipeCommitIngredients.ingredientId, ingredientsTable.id))
      .where(eq(recipeCommitIngredients.commitId, headCommitId))
      .orderBy(recipeCommitIngredients.sortOrder),
    db
      .select({ sortOrder: recipeCommitSteps.sortOrder, content: recipeCommitSteps.content })
      .from(recipeCommitSteps)
      .where(eq(recipeCommitSteps.commitId, headCommitId))
      .orderBy(recipeCommitSteps.sortOrder),
  ])
  return { ingredients: ings as MergeSnapshot['ingredients'], steps }
}

async function getAncestors(db: ReturnType<typeof useDrizzle>, startCommitId: number | null, limit = MAX_ANCESTOR_WALK): Promise<Set<number>> {
  const visited = new Set<number>()
  let current: number | null = startCommitId
  while (current !== null && visited.size < limit && db) {
    visited.add(current)
    const [commit] = await db
      .select({ parentCommitId: recipeCommits.parentCommitId })
      .from(recipeCommits)
      .where(eq(recipeCommits.id, current))
      .limit(1)
    current = commit?.parentCommitId ?? null
  }
  return visited
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const recipeId = Number(getRouterParam(event, 'id'))
  const gmrId = Number(getRouterParam(event, 'gmrId'))
  if (isNaN(recipeId) || isNaN(gmrId)) throw createError({ statusCode: 400, statusMessage: 'Invalid parameters' })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // Verify recipe ownership
  const [recipe] = await db
    .select({ ownerId: recipes.ownerId })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1)

  if (!recipe) throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
  if (recipe.ownerId !== session.user.id) throw createError({ statusCode: 403, statusMessage: 'Only the recipe owner can merge' })

  // Load the GourMerge Request
  const [gmr] = await db
    .select()
    .from(gourmergeRequests)
    .where(and(eq(gourmergeRequests.id, gmrId), eq(gourmergeRequests.recipeId, recipeId)))
    .limit(1)

  if (!gmr) throw createError({ statusCode: 404, statusMessage: 'GourMerge Request not found' })
  if (gmr.status !== 'open') throw createError({ statusCode: 422, statusMessage: `Cannot merge a ${gmr.status} GourMerge Request` })

  // Resolve branches
  const [sourceBranch, targetBranch] = await Promise.all([
    db.select().from(recipeBranches).where(eq(recipeBranches.id, gmr.sourceBranchId)).limit(1),
    db.select().from(recipeBranches).where(eq(recipeBranches.id, gmr.targetBranchId)).limit(1),
  ])

  if (!sourceBranch[0] || !targetBranch[0]) throw createError({ statusCode: 404, statusMessage: 'Branch not found' })

  const sourceHeadId = sourceBranch[0].headCommitId ?? null
  const targetHeadId = targetBranch[0].headCommitId ?? null

  // Find common ancestor by walking target ancestors and checking source lineage
  // Walk source ancestors first (smaller set usually), then find first target ancestor in it
  const sourceAncestors = await getAncestors(db, sourceHeadId)
  let baseCommitId: number | null = null
  let current: number | null = targetHeadId
  let steps = 0
  while (current !== null && steps < MAX_ANCESTOR_WALK) {
    if (sourceAncestors.has(current)) { baseCommitId = current; break }
    const [commit] = await db
      .select({ parentCommitId: recipeCommits.parentCommitId })
      .from(recipeCommits)
      .where(eq(recipeCommits.id, current))
      .limit(1)
    current = commit?.parentCommitId ?? null
    steps++
  }

  // Load snapshots
  const [baseSnapshot, sourceSnapshot, targetSnapshot] = await Promise.all([
    loadSnapshot(db, baseCommitId),
    loadSnapshot(db, sourceHeadId),
    loadSnapshot(db, targetHeadId),
  ])

  // Run three-way merge
  const mergeResult = threeWayMerge(baseSnapshot, sourceSnapshot, targetSnapshot)

  if (mergeResult.hasConflicts) {
    return {
      success: false,
      hasConflicts: true,
      conflicts: mergeResult.conflicts,
    }
  }

  // Execute merge in a transaction
  await db.transaction(async (tx) => {
    // 1. Create merge commit on target branch
    const [mergeCommit] = await tx.insert(recipeCommits).values({
      branchId: gmr.targetBranchId,
      authorId: session.user.id,
      message: `Merge: ${gmr.title}`,
      parentCommitId: targetHeadId,
      isMerge: true,
      mergeSourceCommitId: sourceHeadId,
    }).$returningId()

    if (!mergeCommit) throw createError({ statusCode: 500, statusMessage: 'Insert failed.' })

    // 2. Insert merged ingredients
    if (mergeResult.ingredients.length > 0) {
      await tx.insert(recipeCommitIngredients).values(
        mergeResult.ingredients.map((i) => ({
          commitId: mergeCommit.id,
          ingredientId: i.ingredientId,
          quantity: i.quantity,
          unit: i.unit,
          notes: i.notes ?? undefined,
          sortOrder: i.sortOrder,
        }))
      )
    }

    // 3. Insert merged steps
    if (mergeResult.steps.length > 0) {
      await tx.insert(recipeCommitSteps).values(
        mergeResult.steps.map((s) => ({
          commitId: mergeCommit.id,
          sortOrder: s.sortOrder,
          content: s.content,
        }))
      )
    }

    // 4. Advance target branch head
    await tx
      .update(recipeBranches)
      .set({ headCommitId: mergeCommit.id })
      .where(eq(recipeBranches.id, gmr.targetBranchId))

    // 5. Mark GourMerge Request as merged (immutable after this)
    await tx
      .update(gourmergeRequests)
      .set({ status: 'merged' })
      .where(eq(gourmergeRequests.id, gmrId))
  })

  return { success: true, hasConflicts: false }
})
