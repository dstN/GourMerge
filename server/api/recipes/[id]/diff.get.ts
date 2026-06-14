/**
 * GET /api/recipes/:id/diff — Compare two commits
 *
 * Query params:
 * - from: commit ID (base/older)
 * - to: commit ID (head/newer)
 *
 * Returns a structured CommitDiff with ingredient and step changes.
 */
import { eq } from 'drizzle-orm'
import {
  recipeCommitIngredients,
  recipeCommitSteps,
  ingredients,
} from '~~/server/database/schema'

async function getCommitSnapshot(db: any, commitId: number) {
  const commitIngredients = await db
    .select({
      id: recipeCommitIngredients.id,
      commitId: recipeCommitIngredients.commitId,
      ingredientId: recipeCommitIngredients.ingredientId,
      quantity: recipeCommitIngredients.quantity,
      unit: recipeCommitIngredients.unit,
      notes: recipeCommitIngredients.notes,
      sortOrder: recipeCommitIngredients.sortOrder,
      ingredient: {
        id: ingredients.id,
        name: ingredients.name,
      },
    })
    .from(recipeCommitIngredients)
    .innerJoin(ingredients, eq(recipeCommitIngredients.ingredientId, ingredients.id))
    .where(eq(recipeCommitIngredients.commitId, commitId))
    .orderBy(recipeCommitIngredients.sortOrder)

  const commitSteps = await db
    .select()
    .from(recipeCommitSteps)
    .where(eq(recipeCommitSteps.commitId, commitId))
    .orderBy(recipeCommitSteps.sortOrder)

  return {
    ingredients: commitIngredients,
    steps: commitSteps,
  }
}

export default defineEventHandler(async (event) => {
  const recipeId = Number(getRouterParam(event, 'id'))
  if (isNaN(recipeId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid recipe ID' })
  }

  const query = getQuery(event)
  const fromCommitId = Number(query.from)
  const toCommitId = Number(query.to)

  if (isNaN(fromCommitId) || isNaN(toCommitId)) {
    throw createError({ statusCode: 400, statusMessage: 'Both "from" and "to" commit IDs are required' })
  }

  const db = useDrizzle()

  // Fetch both snapshots in parallel
  const [snapshotA, snapshotB] = await Promise.all([
    getCommitSnapshot(db, fromCommitId),
    getCommitSnapshot(db, toCommitId),
  ])

  // Compute diff using our utility
  const diff = computeCommitDiff(snapshotA, snapshotB)

  return diff
})
