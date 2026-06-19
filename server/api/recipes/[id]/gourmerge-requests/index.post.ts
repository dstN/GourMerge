/**
 * POST /api/recipes/:id/gourmerge-requests — Create a GourMerge Request
 *
 * Proposes changes from a source branch to a target branch.
 * The :id is the TARGET recipe (the one being proposed to).
 */
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { recipes, recipeBranches, gourmergeRequests } from '~~/server/database/schema'
import { generatePublicId } from '~~/server/utils/uuid'

const createSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  sourceBranchId: z.number().int(),
  targetBranchId: z.number().int(),
  /** Optional: if the source branch belongs to a different (forked) recipe */
  sourceRecipeId: z.number().int().optional(),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const targetRecipeId = Number(getRouterParam(event, 'id'))
  if (isNaN(targetRecipeId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid recipe ID' })
  }

  const body = await readBody(event)
  const result = createSchema.safeParse(body)
  if (!result.success) {
    throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: result.error.flatten().fieldErrors })
  }

  const { title, description, sourceBranchId, targetBranchId, sourceRecipeId } = result.data
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // Verify target recipe exists + is accessible
  const [targetRecipe] = await db
    .select({ id: recipes.id, ownerId: recipes.ownerId, visibility: recipes.visibility })
    .from(recipes)
    .where(eq(recipes.id, targetRecipeId))
    .limit(1)

  if (!targetRecipe) throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
  if (targetRecipe.visibility === 'private' && targetRecipe.ownerId !== session.user.id) {
    throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
  }

  // Verify target branch belongs to target recipe
  const [targetBranch] = await db
    .select({ id: recipeBranches.id })
    .from(recipeBranches)
    .where(and(eq(recipeBranches.id, targetBranchId), eq(recipeBranches.recipeId, targetRecipeId)))
    .limit(1)

  if (!targetBranch) throw createError({ statusCode: 404, statusMessage: 'Target branch not found' })

  // Verify source branch
  const sourceOwnerRecipeId = sourceRecipeId ?? targetRecipeId
  const [sourceBranch] = await db
    .select({ id: recipeBranches.id })
    .from(recipeBranches)
    .where(and(eq(recipeBranches.id, sourceBranchId), eq(recipeBranches.recipeId, sourceOwnerRecipeId)))
    .limit(1)

  if (!sourceBranch) throw createError({ statusCode: 404, statusMessage: 'Source branch not found' })

  // Cannot open a GourMerge Request from a branch to itself
  if (sourceBranchId === targetBranchId && sourceOwnerRecipeId === targetRecipeId) {
    throw createError({ statusCode: 422, statusMessage: 'Source and target branch cannot be the same' })
  }

  const [inserted] = await db
    .insert(gourmergeRequests)
    .values({
      publicId: generatePublicId(),
      recipeId: targetRecipeId,
      authorId: session.user.id,
      title,
      description,
      status: 'open',
      sourceBranchId,
      targetBranchId,
      sourceRecipeId: sourceRecipeId ?? null,
    })
    .$returningId()

  if (!inserted) throw createError({ statusCode: 500, statusMessage: 'Insert failed.' })

  setResponseStatus(event, 201)
  return { id: inserted.id }
})
