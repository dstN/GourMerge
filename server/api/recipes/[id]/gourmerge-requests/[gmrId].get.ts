/**
 * GET /api/recipes/:id/gourmerge-requests/:gmrId — Get a single GourMerge Request with diff
 */
import { eq, and } from 'drizzle-orm'
import {
  recipes,
  gourmergeRequests,
  users,
  recipeBranches,
  recipeCommitIngredients,
  recipeCommitSteps,
  ingredients as ingredientsTable,
  gourmergeRequestComments,
} from '~~/server/database/schema'
import type { CommitIngredient, CommitStep } from '~~/shared/types'

async function loadSnapshot(
  db: ReturnType<typeof useDrizzle>,
  headCommitId: number | null
): Promise<{ ingredients: CommitIngredient[]; steps: CommitStep[] }> {
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
        ingredient: { id: ingredientsTable.id, name: ingredientsTable.name },
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
  return {
    ingredients: ings.map((ing) => ({
      ...ing,
      quantity: typeof ing.quantity === 'string' ? parseFloat(ing.quantity) : ing.quantity,
      ingredient: {
        id: ing.ingredient.id,
        name: ing.ingredient.name,
        nameTranslations: {},
        category: null,
        createdAt: '',
      },
    })),
    steps,
  }
}

export default defineEventHandler(async (event) => {
  const recipeId = Number(getRouterParam(event, 'id'))
  const gmrId = Number(getRouterParam(event, 'gmrId'))
  if (isNaN(recipeId) || isNaN(gmrId)) throw createError({ statusCode: 400, statusMessage: 'Invalid parameters' })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })
  const session = await getUserSession(event)

  const [recipe] = await db
    .select({ ownerId: recipes.ownerId, visibility: recipes.visibility })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1)

  if (!recipe) throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
  if (recipe.visibility === 'private' && recipe.ownerId !== session?.user?.id) {
    throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
  }

  const [gmr] = await db
    .select()
    .from(gourmergeRequests)
    .where(and(eq(gourmergeRequests.id, gmrId), eq(gourmergeRequests.recipeId, recipeId)))
    .limit(1)

  if (!gmr) throw createError({ statusCode: 404, statusMessage: 'GourMerge Request not found' })

  const [author] = await db
    .select({ username: users.username, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, gmr.authorId))
    .limit(1)

  // Resolve branches + compute diff
  const [sourceBranch, targetBranch] = await Promise.all([
    db.select().from(recipeBranches).where(eq(recipeBranches.id, gmr.sourceBranchId)).limit(1),
    db.select().from(recipeBranches).where(eq(recipeBranches.id, gmr.targetBranchId)).limit(1),
  ])

  const [sourceSnapshot, targetSnapshot] = await Promise.all([
    loadSnapshot(db, sourceBranch[0]?.headCommitId ?? null),
    loadSnapshot(db, targetBranch[0]?.headCommitId ?? null),
  ])

  const diff = computeCommitDiff(sourceSnapshot, targetSnapshot)

  // Load comments
  const comments = await db
    .select({
      id: gourmergeRequestComments.id,
      body: gourmergeRequestComments.body,
      authorId: gourmergeRequestComments.authorId,
      createdAt: gourmergeRequestComments.createdAt,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
    })
    .from(gourmergeRequestComments)
    .innerJoin(users, eq(gourmergeRequestComments.authorId, users.id))
    .where(eq(gourmergeRequestComments.gourmergeRequestId, gmrId))
    .orderBy(gourmergeRequestComments.createdAt)

  return {
    ...gmr,
    author,
    sourceBranch: sourceBranch[0] ?? null,
    targetBranch: targetBranch[0] ?? null,
    diff,
    comments,
    canMerge: session?.user?.id === recipe.ownerId && gmr.status === 'open',
  }
})
