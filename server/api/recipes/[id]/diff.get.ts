/**
 * GET /api/recipes/:id/diff — Compare two commits
 *
 * Query params:
 * - from: commit ID (base/older)
 * - to: commit ID (head/newer)
 *
 * Returns a structured CommitDiff with ingredient and step changes.
 *
 * ## Two guards, and neither is optional
 *
 * This endpoint used to have neither, which made it a full unauthenticated read of every
 * private recipe in the database:
 *
 * 1. **The recipe must be visible to the caller.** Without this, a private recipe's
 *    contents were readable by anyone who knew its id — and ids are sequential integers.
 * 2. **Both commit ids must belong to *this* recipe.** This is the sharper half. `from` and
 *    `to` were used verbatim, so `/api/recipes/<any public id>/diff?from=1&to=2` returned
 *    the ingredients and steps of commits 1 and 2 *whatever recipe they lived in*. The path
 *    parameter was decoration; walking the integers dumped the whole table.
 *
 * `requireCommitInRecipe` joins through `recipe_branches` because `recipe_commits` carries
 * no `recipe_id` of its own — which is exactly why the check was easy to omit.
 */
import { eq } from 'drizzle-orm'
import type { CommitIngredient, CommitStep } from '~~/shared/types'
import { recipeCommitIngredients, recipeCommitSteps, ingredients } from '~~/server/database/schema'

async function getCommitSnapshot(db: NonNullable<ReturnType<typeof useDrizzle>>, commitId: number) {
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
  const recipe = await requireVisibleRecipe(event, recipeId)

  const query = getQuery(event)
  const fromCommitId = Number(query.from)
  const toCommitId = Number(query.to)

  if (isNaN(fromCommitId) || isNaN(toCommitId)) {
    throw createError({ statusCode: 400, statusMessage: 'Both "from" and "to" commit IDs are required' })
  }

  // Scope both ids to this recipe before a single row is read — see the docblock.
  await Promise.all([requireCommitInRecipe(recipe.id, fromCommitId), requireCommitInRecipe(recipe.id, toCommitId)])

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // Fetch both snapshots in parallel
  const [snapshotA, snapshotB] = await Promise.all([
    getCommitSnapshot(db, fromCommitId),
    getCommitSnapshot(db, toCommitId),
  ])

  // Quantity comes back as string from mysql2 decimals; CommitIngredient expects number.
  // The diff engine compares by value and handles both; double-cast to satisfy types.
  type DiffInput = { ingredients: CommitIngredient[]; steps: CommitStep[] }
  const diff = computeCommitDiff(snapshotA as unknown as DiffInput, snapshotB as unknown as DiffInput)

  return diff
})
