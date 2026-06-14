/**
 * GET /api/recipes/:id/branches/:branchId/snapshot
 *
 * Returns the head commit snapshot (ingredients + steps) for a given branch.
 * Used by the recipe editor when switching between branches.
 */
import { eq, and } from 'drizzle-orm'
import {
  recipes,
  recipeBranches,
  recipeCommitIngredients,
  recipeCommitSteps,
  ingredients as ingredientsTable,
} from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const recipeId = Number(getRouterParam(event, 'id'))
  const branchId = Number(getRouterParam(event, 'branchId'))

  if (isNaN(recipeId) || isNaN(branchId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid parameters' })
  }

  const db = useDrizzle()

  // Verify recipe exists + check visibility
  const [recipe] = await db
    .select({ ownerId: recipes.ownerId, visibility: recipes.visibility })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1)

  if (!recipe) {
    throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
  }

  if (recipe.visibility === 'private') {
    const session = await getUserSession(event)
    if (!session?.user || session.user.id !== recipe.ownerId) {
      throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
    }
  }

  // Find branch
  const [branch] = await db
    .select()
    .from(recipeBranches)
    .where(and(eq(recipeBranches.id, branchId), eq(recipeBranches.recipeId, recipeId)))
    .limit(1)

  if (!branch) {
    throw createError({ statusCode: 404, statusMessage: 'Branch not found' })
  }

  if (!branch.headCommitId) {
    return { ingredients: [], steps: [], branchId, headCommitId: null }
  }

  const [currentIngredients, currentSteps] = await Promise.all([
    db
      .select({
        id: recipeCommitIngredients.id,
        ingredientId: recipeCommitIngredients.ingredientId,
        ingredientName: ingredientsTable.name,
        quantity: recipeCommitIngredients.quantity,
        unit: recipeCommitIngredients.unit,
        notes: recipeCommitIngredients.notes,
        sortOrder: recipeCommitIngredients.sortOrder,
      })
      .from(recipeCommitIngredients)
      .innerJoin(ingredientsTable, eq(recipeCommitIngredients.ingredientId, ingredientsTable.id))
      .where(eq(recipeCommitIngredients.commitId, branch.headCommitId))
      .orderBy(recipeCommitIngredients.sortOrder),

    db
      .select()
      .from(recipeCommitSteps)
      .where(eq(recipeCommitSteps.commitId, branch.headCommitId))
      .orderBy(recipeCommitSteps.sortOrder),
  ])

  return {
    branchId,
    headCommitId: branch.headCommitId,
    ingredients: currentIngredients,
    steps: currentSteps,
  }
})
