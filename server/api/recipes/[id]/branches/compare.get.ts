/**
 * GET /api/recipes/:id/branches/compare
 *
 * Compare the head commits of two branches (same or cross-recipe).
 *
 * Query params:
 *   from            — source branch ID (the "proposed changes" side)
 *   to              — target branch ID (the "base" side)
 *   sourceRecipeId  — (optional) recipe ID that owns the source branch
 *                     if omitted, assumes the same recipe as :id
 */
import { eq, and } from 'drizzle-orm'
import {
  recipes,
  recipeBranches,
  recipeCommitIngredients,
  recipeCommitSteps,
  ingredients as ingredientsTable,
} from '~~/server/database/schema'

async function loadSnapshot(db: ReturnType<typeof useDrizzle>, headCommitId: number | null) {
  if (!headCommitId || !db) return { ingredients: [], steps: [] }

  const [ings, steps] = await Promise.all([
    db
      .select({
        id: recipeCommitIngredients.id,
        commitId: recipeCommitIngredients.commitId,
        ingredientId: recipeCommitIngredients.ingredientId,
        quantity: recipeCommitIngredients.quantity,
        unit: recipeCommitIngredients.unit,
        notes: recipeCommitIngredients.notes,
        sortOrder: recipeCommitIngredients.sortOrder,
        ingredient: {
          id: ingredientsTable.id,
          name: ingredientsTable.name,
        },
      })
      .from(recipeCommitIngredients)
      .innerJoin(ingredientsTable, eq(recipeCommitIngredients.ingredientId, ingredientsTable.id))
      .where(eq(recipeCommitIngredients.commitId, headCommitId))
      .orderBy(recipeCommitIngredients.sortOrder),

    db
      .select()
      .from(recipeCommitSteps)
      .where(eq(recipeCommitSteps.commitId, headCommitId))
      .orderBy(recipeCommitSteps.sortOrder),
  ])

  return { ingredients: ings, steps }
}

export default defineEventHandler(async (event) => {
  const recipeId = Number(getRouterParam(event, 'id'))
  if (isNaN(recipeId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid recipe ID' })
  }

  const query = getQuery(event)
  const fromBranchId = Number(query.from)
  const toBranchId = Number(query.to)
  const sourceRecipeId = query.sourceRecipeId ? Number(query.sourceRecipeId) : recipeId

  if (isNaN(fromBranchId) || isNaN(toBranchId)) {
    throw createError({ statusCode: 400, statusMessage: 'from and to branch IDs required' })
  }

  const db = useDrizzle()!

  // Verify target recipe visibility
  const [targetRecipe] = await db
    .select({ ownerId: recipes.ownerId, visibility: recipes.visibility })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1)

  if (!targetRecipe) {
    throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
  }

  if (targetRecipe.visibility === 'private') {
    const session = await getUserSession(event)
    if (session?.user?.id !== targetRecipe.ownerId) {
      throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
    }
  }

  // Resolve branches
  const [sourceBranch] = await db
    .select({ id: recipeBranches.id, headCommitId: recipeBranches.headCommitId, name: recipeBranches.name })
    .from(recipeBranches)
    .where(and(eq(recipeBranches.id, fromBranchId), eq(recipeBranches.recipeId, sourceRecipeId)))
    .limit(1)

  const [targetBranch] = await db
    .select({ id: recipeBranches.id, headCommitId: recipeBranches.headCommitId, name: recipeBranches.name })
    .from(recipeBranches)
    .where(and(eq(recipeBranches.id, toBranchId), eq(recipeBranches.recipeId, recipeId)))
    .limit(1)

  if (!sourceBranch || !targetBranch) {
    throw createError({ statusCode: 404, statusMessage: 'Branch not found' })
  }

  const [fromSnapshot, toSnapshot] = await Promise.all([
    loadSnapshot(db, sourceBranch.headCommitId ?? null),
    loadSnapshot(db, targetBranch.headCommitId ?? null),
  ])

  const diff = computeCommitDiff(fromSnapshot, toSnapshot)

  return {
    sourceBranch: { id: sourceBranch.id, name: sourceBranch.name },
    targetBranch: { id: targetBranch.id, name: targetBranch.name },
    diff,
  }
})
