/**
 * POST /api/recipes/:id/commits — Create a new commit (save recipe state)
 *
 * Receives the full ingredient list + steps and stores them as a new snapshot.
 * This is the core "save" action — each save is a commit in the recipe's history.
 */
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import {
  recipes,
  recipeBranches,
  recipeCommits,
  recipeCommitIngredients,
  recipeCommitSteps,
} from '~~/server/database/schema'

const ingredientSchema = z.object({
  ingredientId: z.number().int(),
  quantity: z.string().or(z.number()).transform(String),
  unit: z.enum(['g', 'ml', 'piece', 'pinch', 'tsp', 'tbsp']),
  notes: z.string().max(300).optional().nullable(),
  sortOrder: z.number().int().min(0),
})

const stepSchema = z.object({
  sortOrder: z.number().int().min(1),
  content: z.string().min(1),
  contentTranslations: z.object({
    de: z.string().optional(),
    en: z.string().optional(),
    fr: z.string().optional(),
    it: z.string().optional(),
  }).optional().nullable(),
})

const commitSchema = z.object({
  message: z.string().min(1).max(500),
  branchId: z.number().int(),
  ingredients: z.array(ingredientSchema),
  steps: z.array(stepSchema),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const recipeId = Number(getRouterParam(event, 'id'))
  if (isNaN(recipeId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid recipe ID' })
  }

  const body = await readBody(event)
  const result = commitSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Validation failed',
      data: result.error.flatten().fieldErrors,
    })
  }

  const { message, branchId, ingredients, steps } = result.data
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // ── Verify recipe ownership ─────────────────────────────────
  const [recipe] = await db
    .select({ ownerId: recipes.ownerId })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1)

  if (!recipe || recipe.ownerId !== session.user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  // ── Verify branch belongs to recipe ─────────────────────────
  const [branch] = await db
    .select()
    .from(recipeBranches)
    .where(and(
      eq(recipeBranches.id, branchId),
      eq(recipeBranches.recipeId, recipeId),
    ))
    .limit(1)

  if (!branch) {
    throw createError({ statusCode: 404, statusMessage: 'Branch not found' })
  }

  // ── Create commit ───────────────────────────────────────────
  const [commit] = await db.insert(recipeCommits).values({
    branchId,
    parentCommitId: branch.headCommitId,
    authorId: session.user.id,
    message,
  }).$returningId()

  if (!commit) throw createError({ statusCode: 500, statusMessage: 'Insert failed.' })

  // ── Store ingredient snapshot ───────────────────────────────
  if (ingredients.length > 0) {
    await db.insert(recipeCommitIngredients).values(
      ingredients.map((ing) => ({
        commitId: commit.id,
        ingredientId: ing.ingredientId,
        quantity: ing.quantity,
        unit: ing.unit,
        notes: ing.notes,
        sortOrder: ing.sortOrder,
      })),
    )
  }

  // ── Store step snapshot ─────────────────────────────────────
  if (steps.length > 0) {
    await db.insert(recipeCommitSteps).values(
      steps.map((step) => ({
        commitId: commit.id,
        sortOrder: step.sortOrder,
        content: step.content,
        contentTranslations: step.contentTranslations ?? null,
      })),
    )
  }

  // ── Update branch head pointer ──────────────────────────────
  await db
    .update(recipeBranches)
    .set({ headCommitId: commit.id })
    .where(eq(recipeBranches.id, branchId))

  setResponseStatus(event, 201)
  return { commitId: commit.id }
})
