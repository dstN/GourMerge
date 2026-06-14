/**
 * GET /api/recipes/by-slug/:username/:slug — Resolve a recipe by username + slug
 *
 * This is the primary lookup for GitHub-style URLs (/username/recipe-slug).
 * Returns the full recipe data with branches, ingredients, and steps.
 */
import { eq, and, sql, inArray } from 'drizzle-orm'
import {
  recipes,
  users,
  recipeBranches,
  recipeCommitIngredients,
  recipeCommitSteps,
  ingredients,
  ingredientNutrition,
  recipeStars,
} from '~~/server/database/schema'
import { computeNutritionTotals, perServing } from '~~/server/utils/nutrition'

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')
  const slug = getRouterParam(event, 'slug')
  const { locale: rawLocale } = getQuery(event)
  const locale = ['de', 'en', 'fr', 'it'].includes(String(rawLocale)) ? String(rawLocale) : 'en'

  if (!username || !slug) {
    throw createError({ statusCode: 400, statusMessage: 'Username and slug are required' })
  }

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // ── Resolve owner ──────────────────────────────────────────
  const [owner] = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.username, username))
    .limit(1)

  if (!owner) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  // ── Find recipe by owner + slug ────────────────────────────
  const [recipe] = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      slug: recipes.slug,
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
    })
    .from(recipes)
    .where(and(
      eq(recipes.ownerId, owner.id),
      eq(recipes.slug, slug),
    ))
    .limit(1)

  if (!recipe) {
    throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
  }

  // ── Check visibility ───────────────────────────────────────
  const session = await getUserSession(event)
  if (recipe.visibility === 'private') {
    if (!session?.user || session.user.id !== owner.id) {
      throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
    }
  }

  // ── Check if current user has starred this recipe ──────────
  let isStarred = false
  if (session?.user) {
    const [star] = await db
      .select({ id: recipeStars.id })
      .from(recipeStars)
      .where(and(eq(recipeStars.recipeId, recipe.id), eq(recipeStars.userId, session.user.id)))
      .limit(1)
    isStarred = !!star
  }

  // ── Get branches ───────────────────────────────────────────
  const branches = await db
    .select()
    .from(recipeBranches)
    .where(eq(recipeBranches.recipeId, recipe.id))

  // ── Get latest commit from default branch ──────────────────
  const defaultBranch = branches.find((b) => b.isDefault) || branches[0]
  const headCommitId = defaultBranch?.headCommitId

  const currentIngredients = headCommitId ? await db
    .select({
      id: recipeCommitIngredients.id,
      ingredientId: recipeCommitIngredients.ingredientId,
      ingredientName: sql<string>`COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(${ingredients.nameTranslations}, ${`$.${locale}`})), 'null'), ${ingredients.name})`,
      quantity: recipeCommitIngredients.quantity,
      unit: recipeCommitIngredients.unit,
      notes: recipeCommitIngredients.notes,
      sortOrder: recipeCommitIngredients.sortOrder,
    })
    .from(recipeCommitIngredients)
    .innerJoin(ingredients, eq(recipeCommitIngredients.ingredientId, ingredients.id))
    .where(eq(recipeCommitIngredients.commitId, headCommitId))
    .orderBy(recipeCommitIngredients.sortOrder) : []

  const currentSteps = headCommitId ? await db
    .select()
    .from(recipeCommitSteps)
    .where(eq(recipeCommitSteps.commitId, headCommitId))
    .orderBy(recipeCommitSteps.sortOrder) : []

  // ── Compute nutrition totals ───────────────────────────────
  let nutritionTotal = null
  let nutritionPerServing = null

  if (currentIngredients.length > 0) {
    const ingredientIds = [...new Set(currentIngredients.map((i) => i.ingredientId))]
    const nutritionRows = await db
      .select()
      .from(ingredientNutrition)
      .where(inArray(ingredientNutrition.ingredientId, ingredientIds))

    const nutritionMap = new Map(nutritionRows.map((n) => [n.ingredientId, n]))
    const totals = computeNutritionTotals(currentIngredients, nutritionMap)
    nutritionTotal = totals
    nutritionPerServing = perServing(totals, recipe.servings ?? 4)
  }

  return {
    ...recipe,
    owner,
    branches,
    defaultBranch,
    currentIngredients,
    currentSteps,
    isStarred,
    nutritionTotal,
    nutritionPerServing,
  }
})
