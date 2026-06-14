/**
 * GET /api/recipes/:id — Get a single recipe with branches
 */
import { eq, and } from 'drizzle-orm'
import { recipes, users, recipeBranches, recipeCommits, recipeCommitIngredients, recipeCommitSteps, ingredients } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid recipe ID' })
  }

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // ── Get recipe with owner ───────────────────────────────────
  const [recipe] = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      description: recipes.description,
      visibility: recipes.visibility,
      servings: recipes.servings,
      prepTimeMinutes: recipes.prepTimeMinutes,
      cookTimeMinutes: recipes.cookTimeMinutes,
      difficulty: recipes.difficulty,
      starCount: recipes.starCount,
      forkCount: recipes.forkCount,
      forkedFromRecipeId: recipes.forkedFromRecipeId,
      createdAt: recipes.createdAt,
      updatedAt: recipes.updatedAt,
      owner: {
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(recipes)
    .innerJoin(users, eq(recipes.ownerId, users.id))
    .where(eq(recipes.id, id))
    .limit(1)

  if (!recipe) {
    throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
  }

  // ── Check visibility ────────────────────────────────────────
  if (recipe.visibility === 'private') {
    const session = await getUserSession(event)
    if (!session?.user || session.user.id !== recipe.owner.id) {
      throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
    }
  }

  // ── Get branches ────────────────────────────────────────────
  const branches = await db
    .select()
    .from(recipeBranches)
    .where(eq(recipeBranches.recipeId, id))

  // ── Get latest commit from default branch ───────────────────
  const defaultBranch = branches.find((b) => b.isDefault) || branches[0]
  let currentIngredients: any[] = []
  let currentSteps: any[] = []

  if (defaultBranch?.headCommitId) {
    // Get ingredients for head commit
    currentIngredients = await db
      .select({
        id: recipeCommitIngredients.id,
        ingredientId: recipeCommitIngredients.ingredientId,
        ingredientName: ingredients.name,
        quantity: recipeCommitIngredients.quantity,
        unit: recipeCommitIngredients.unit,
        notes: recipeCommitIngredients.notes,
        sortOrder: recipeCommitIngredients.sortOrder,
      })
      .from(recipeCommitIngredients)
      .innerJoin(ingredients, eq(recipeCommitIngredients.ingredientId, ingredients.id))
      .where(eq(recipeCommitIngredients.commitId, defaultBranch.headCommitId))
      .orderBy(recipeCommitIngredients.sortOrder)

    // Get steps for head commit
    currentSteps = await db
      .select()
      .from(recipeCommitSteps)
      .where(eq(recipeCommitSteps.commitId, defaultBranch.headCommitId))
      .orderBy(recipeCommitSteps.sortOrder)
  }

  return {
    ...recipe,
    branches,
    defaultBranch,
    currentIngredients,
    currentSteps,
  }
})
