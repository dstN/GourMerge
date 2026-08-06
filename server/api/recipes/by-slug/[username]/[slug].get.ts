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
  recipeTags,
  tags,
  gourmergeRequests,
} from '~~/server/database/schema'
import { computeNutritionTotals, perServing } from '~~/server/utils/nutrition'
import { getBestDisplayUnit } from '~~/server/utils/units'
import type { CanonicalUnit, MeasurementSystem } from '~~/shared/types'

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')
  const slug = getRouterParam(event, 'slug')
  const { locale: rawLocale, branch: rawBranch } = getQuery(event)
  const locale = ['de', 'en', 'fr', 'it'].includes(String(rawLocale)) ? String(rawLocale) : 'en'
  /** Optional branch to display. Absent or unknown falls back to the default branch. */
  const requestedBranchId = Number(rawBranch) > 0 ? Number(rawBranch) : null

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
      dietaryType: recipes.dietaryType,
      titleTranslations: recipes.titleTranslations,
      descriptionTranslations: recipes.descriptionTranslations,
      starCount: recipes.starCount,
      forkCount: recipes.forkCount,
      forkedFromRecipeId: recipes.forkedFromRecipeId,
      createdAt: recipes.createdAt,
      updatedAt: recipes.updatedAt,
    })
    .from(recipes)
    .where(and(eq(recipes.ownerId, owner.id), eq(recipes.slug, slug)))
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
  // Guests get metric — it is the storage form and the default for the German
  // primary audience.
  let viewerMeasurementSystem: MeasurementSystem = 'metric'
  if (session?.user) {
    const [star] = await db
      .select({ id: recipeStars.id })
      .from(recipeStars)
      .where(and(eq(recipeStars.recipeId, recipe.id), eq(recipeStars.userId, session.user.id)))
      .limit(1)
    isStarred = !!star

    // Read from the row, not the session: the session cookie predates this field
    // and is only refreshed on login, so an existing session would otherwise
    // never see a preference change.
    const [viewer] = await db
      .select({ system: users.preferredMeasurementSystem })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1)
    if (viewer?.system) viewerMeasurementSystem = viewer.system as MeasurementSystem
  }

  // ── Get branches ───────────────────────────────────────────
  const branches = await db.select().from(recipeBranches).where(eq(recipeBranches.recipeId, recipe.id))

  /**
   * Which branch this page shows.
   *
   * The default branch used to be the only one that could be *viewed* — the branches page
   * offered "edit" and "history" links but nothing to read a variant, so a branch like
   * "paleo" was reachable only through the editor. Everything below (ingredients, steps,
   * nutrition, structured data) now keys off `selectedBranch`.
   *
   * The lookup is `find` over branches already filtered to this recipe, so an id belonging
   * to somebody else's recipe cannot select anything — it falls through to the default
   * rather than leaking a foreign snapshot.
   */
  const defaultBranch = branches.find((b) => b.isDefault) || branches[0]
  const selectedBranch = (requestedBranchId ? branches.find((b) => b.id === requestedBranchId) : null) ?? defaultBranch
  const headCommitId = selectedBranch?.headCommitId

  const currentIngredients = headCommitId
    ? await db
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
        .orderBy(recipeCommitIngredients.sortOrder)
    : []

  /**
   * Apply the viewer's measurement preference on the READ path.
   *
   * Storage stays metric-canonical (g/ml/piece/pinch/tsp/tbsp) — see
   * current_state §4. `getBestDisplayUnit` also handles the metric niceties
   * (1200 g → 1.2 kg), so this runs for both systems, not just imperial.
   *
   * This closes a gap where /settings offered a Metric/Imperial select that was
   * persisted to `users.preferred_measurement_system` and then never read by
   * anything: the whole conversion engine in `server/utils/units.ts` was reachable
   * only from its own unit test. Conversion happens here rather than client-side
   * because the session cookie does not carry the preference.
   */
  const measurementSystem: MeasurementSystem = viewerMeasurementSystem
  const displayIngredients = currentIngredients.map((ing) => {
    const raw = Number(ing.quantity)
    if (!Number.isFinite(raw)) return { ...ing, displayQuantity: ing.quantity, displayUnit: ing.unit }
    const best = getBestDisplayUnit(raw, ing.unit as CanonicalUnit, measurementSystem)
    return {
      ...ing,
      // Canonical `quantity`/`unit` are preserved above: the editor, the diff
      // engine and the nutrition maths all depend on them.
      displayQuantity: String(best.quantity),
      displayUnit: best.unit,
    }
  })

  const currentSteps = headCommitId
    ? await db
        .select()
        .from(recipeCommitSteps)
        .where(eq(recipeCommitSteps.commitId, headCommitId))
        .orderBy(recipeCommitSteps.sortOrder)
    : []

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

  // ── Fetch recipe tags ──────────────────────────────────────
  const tagRows = await db
    .select({ name: tags.name })
    .from(recipeTags)
    .innerJoin(tags, eq(recipeTags.tagId, tags.id))
    .where(eq(recipeTags.recipeId, recipe.id))

  const recipeTags_ = tagRows.map((t) => t.name)

  // ── Resolve fork source (original recipe + its owner) ──────
  let forkedFrom: { username: string; slug: string; title: string; displayName: string | null } | null = null
  if (recipe.forkedFromRecipeId) {
    const [src] = await db
      .select({ slug: recipes.slug, title: recipes.title, username: users.username, displayName: users.displayName })
      .from(recipes)
      .innerJoin(users, eq(recipes.ownerId, users.id))
      .where(eq(recipes.id, recipe.forkedFromRecipeId))
      .limit(1)
    forkedFrom = src ?? null
  }

  /**
   * Only OPEN requests. Closed and merged ones are history; a badge is a call for
   * attention, so counting them would make it permanently non-zero and therefore
   * meaningless. Computed here rather than fetched separately so the header renders
   * server-side with everything else.
   */
  const [openGmrs] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(gourmergeRequests)
    .where(and(eq(gourmergeRequests.recipeId, recipe.id), eq(gourmergeRequests.status, 'open')))

  return {
    ...recipe,
    openGmrCount: Number(openGmrs?.n ?? 0),
    tags: recipeTags_,
    owner,
    forkedFrom,
    branches,
    defaultBranch,
    /** The branch actually rendered — equals `defaultBranch` unless `?branch=` selected another. */
    selectedBranch,
    // Carries canonical `quantity`/`unit` PLUS `displayQuantity`/`displayUnit`
    // resolved for this viewer's measurement preference.
    currentIngredients: displayIngredients,
    currentSteps,
    isStarred,
    measurementSystem,
    nutritionTotal,
    nutritionPerServing,
  }
})
