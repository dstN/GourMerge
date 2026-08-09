/**
 * POST /api/recipes/:id/simulate-activity — Tour Simulation Endpoint
 *
 * Simulates background activity on a user's newly created demo recipe so the tour
 * can demonstrate the History and GourMerge Requests features with actual data.
 * - Creates a dummy commit changing an ingredient quantity.
 * - Creates a dummy GourMerge Request proposing an addition.
 *
 * ## Why "the recipe has exactly one commit" is the gate, not a client-supplied flag
 *
 * There is no server-side notion of "the visitor is currently in the tour" — `useProductTour`
 * is client-only, in-memory state. A flag on the request (`?tour=1`) would just move the
 * decision to whoever sends the request, which is the caller we are trying to bound. The
 * tour only ever calls this in the instant right after `POST /api/recipes` creates the demo
 * recipe, before anything else has touched it — and that instant has one structural
 * fingerprint that isn't self-reported: exactly the one commit recipe creation itself made.
 * Once a second commit exists, the window this endpoint exists for has closed, on any
 * recipe, tour-created or not, so it refuses rather than fabricating more history on top of
 * real edits. The per-user rate limit below is defence in depth for the one call that
 * remains legitimate, not the primary control.
 */
import { eq, and, sql, count } from 'drizzle-orm'
import {
  recipes,
  recipeBranches,
  recipeCommits,
  recipeCommitIngredients,
  recipeCommitSteps,
  users,
  gourmergeRequests,
} from '~~/server/database/schema'
import { generatePublicId } from '~~/server/utils/uuid'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const recipeId = Number(getRouterParam(event, 'id'))
  if (isNaN(recipeId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid recipe ID' })
  }

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // ── Verify recipe exists and belongs to the user ────────────────
  const [recipe] = await db
    .select({ id: recipes.id, ownerId: recipes.ownerId })
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.ownerId, session.user.id)))
    .limit(1)

  if (!recipe) {
    throw createError({ statusCode: 404, statusMessage: 'Recipe not found or not owned by user' })
  }

  await useRateLimit(`recipe:simulate-activity:${session.user.id}`, { max: 5, windowSeconds: 3600 })

  // Find system user
  const [systemUser] = await db.select({ id: users.id }).from(users).where(eq(users.username, 'system')).limit(1)

  const systemUserId = systemUser?.id || session.user.id // Fallback to current user if system user missing

  // Find main branch
  const [mainBranch] = await db
    .select({ id: recipeBranches.id, headCommitId: recipeBranches.headCommitId })
    .from(recipeBranches)
    .where(and(eq(recipeBranches.recipeId, recipeId), eq(recipeBranches.isDefault, true)))
    .limit(1)

  if (!mainBranch || !mainBranch.headCommitId) {
    throw createError({ statusCode: 400, statusMessage: 'Main branch or head commit missing' })
  }

  // The structural gate described above: only the single commit recipe creation itself
  // made may exist yet. See the module docblock for why this is the check rather than a
  // self-reported "I am in the tour" flag.
  const [commitCountRow] = await db
    .select({ commitCount: count() })
    .from(recipeCommits)
    .where(eq(recipeCommits.branchId, mainBranch.id))
  if (commitCountRow?.commitCount !== 1) {
    throw createError({ statusCode: 409, statusMessage: 'This recipe already has history of its own' })
  }

  const headCommitId = mainBranch.headCommitId

  // Fetch ingredients of head commit
  const headIngredients = await db
    .select()
    .from(recipeCommitIngredients)
    .where(eq(recipeCommitIngredients.commitId, headCommitId))
    .orderBy(recipeCommitIngredients.sortOrder)

  // Fetch steps of head commit
  const headSteps = await db
    .select()
    .from(recipeCommitSteps)
    .where(eq(recipeCommitSteps.commitId, headCommitId))
    .orderBy(recipeCommitSteps.sortOrder)

  // =========================================================================
  // 1. SIMULATE HISTORY: Create a new commit on main branch
  // =========================================================================

  const [historyCommitResult] = await db.insert(recipeCommits).values({
    branchId: mainBranch.id,
    parentCommitId: headCommitId,
    authorId: session.user.id,
    message: 'Menge angepasst',
  })
  const historyCommitId = historyCommitResult.insertId

  // Update recipe description to make a visible change in metadata
  await db.update(recipes).set({ description: 'Eine optimierte Version des Rezepts.' }).where(eq(recipes.id, recipeId))

  // Insert ingredients (double the quantity of the first one if it exists)
  if (headIngredients.length > 0) {
    const newIngredients = headIngredients.map((ing, idx) => ({
      commitId: historyCommitId,
      ingredientId: ing.ingredientId,
      quantity: idx === 0 ? (Number(ing.quantity) * 2).toString() : ing.quantity,
      unit: ing.unit,
      notes: ing.notes,
      sortOrder: ing.sortOrder,
    }))
    await db.insert(recipeCommitIngredients).values(newIngredients)
  }

  // Insert steps (unchanged)
  if (headSteps.length > 0) {
    const newSteps = headSteps.map((step) => ({
      commitId: historyCommitId,
      sortOrder: step.sortOrder,
      content: step.content,
      contentTranslations: step.contentTranslations,
    }))
    await db.insert(recipeCommitSteps).values(newSteps)
  }

  // Fast-forward main branch
  await db.update(recipeBranches).set({ headCommitId: historyCommitId }).where(eq(recipeBranches.id, mainBranch.id))

  // =========================================================================
  // 2. SIMULATE GOURMERGE REQUEST: Create a new branch and open a GourMerge Request
  // =========================================================================

  // Create a new branch for the GourMerge Request
  const [prBranchResult] = await db.insert(recipeBranches).values({
    recipeId: recipeId,
    name: 'feature-birne',
    isDefault: false,
    headCommitId: historyCommitId, // will be updated
  })
  const prBranchId = prBranchResult.insertId

  // Create commit on GourMerge Request branch
  const [prCommitResult] = await db.insert(recipeCommits).values({
    branchId: prBranchId,
    parentCommitId: historyCommitId,
    authorId: systemUserId,
    message: 'Birne hinzugefügt',
  })
  const prCommitId = prCommitResult.insertId

  // Insert ingredients (copy from history commit, add a new one)
  if (headIngredients.length > 0) {
    const prIngredients = headIngredients.map((ing, idx) => ({
      commitId: prCommitId,
      ingredientId: ing.ingredientId,
      quantity: idx === 0 ? (Number(ing.quantity) * 2).toString() : ing.quantity,
      unit: ing.unit,
      notes: ing.notes,
      sortOrder: ing.sortOrder,
    }))
    // Find "Birne" ingredient if it exists, else just use id=1
    let birneId = 1
    const birneRows = (await db.execute(
      sql.raw(
        `SELECT id FROM ingredients WHERE name LIKE '%Birne%' OR JSON_UNQUOTE(JSON_EXTRACT(name_translations, '$.de')) LIKE '%Birne%' LIMIT 1`
      )
    )) as unknown as { id: number }[][]
    if (birneRows[0] && birneRows[0].length > 0) {
      birneId = birneRows[0][0]!.id
    }

    prIngredients.push({
      commitId: prCommitId,
      ingredientId: birneId,
      quantity: '1.00',
      unit: 'piece',
      notes: 'optional',
      sortOrder: headIngredients.length,
    })
    await db.insert(recipeCommitIngredients).values(prIngredients)
  }

  // Insert steps
  if (headSteps.length > 0) {
    const prSteps = headSteps.map((step) => ({
      commitId: prCommitId,
      sortOrder: step.sortOrder,
      content: step.content,
      contentTranslations: step.contentTranslations,
    }))
    await db.insert(recipeCommitSteps).values(prSteps)
  }

  // Fast-forward GourMerge Request branch
  await db.update(recipeBranches).set({ headCommitId: prCommitId }).where(eq(recipeBranches.id, prBranchId))

  // Create GourMerge Request
  await db.insert(gourmergeRequests).values({
    publicId: generatePublicId(),
    recipeId: recipeId,
    authorId: systemUserId,
    title: 'Wie wärs noch mit einer Birne?',
    description: 'Birnen geben dem Ganzen noch eine süße Note.',
    sourceBranchId: prBranchId,
    targetBranchId: mainBranch.id,
    sourceRecipeId: null, // Same recipe GourMerge Request
    status: 'open',
  })

  return { success: true }
})
