/**
 * POST /api/recipes/:id/branches — Create a new branch
 *
 * Creates a branch from a source branch's head commit.
 * This is the equivalent of `git checkout -b <name>`.
 */
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { recipes, recipeBranches } from '~~/server/database/schema'

const createBranchSchema = z.object({
  name: z.string()
    .min(1).max(100)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Branch name can only contain letters, numbers, underscores, and hyphens'),
  /** Branch to fork from (defaults to the default branch) */
  fromBranchId: z.number().int().optional(),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const recipeId = Number(getRouterParam(event, 'id'))
  if (isNaN(recipeId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid recipe ID' })
  }

  const body = await readBody(event)
  const result = createBranchSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Validation failed',
      data: result.error.flatten().fieldErrors,
    })
  }

  const { name, fromBranchId } = result.data
  const db = useDrizzle()

  // ── Verify ownership ───────────────────────────────────────
  const [recipe] = await db
    .select({ ownerId: recipes.ownerId })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1)

  if (!recipe || recipe.ownerId !== session.user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  // ── Check branch name doesn't already exist ────────────────
  const [existingBranch] = await db
    .select({ id: recipeBranches.id })
    .from(recipeBranches)
    .where(and(
      eq(recipeBranches.recipeId, recipeId),
      eq(recipeBranches.name, name),
    ))
    .limit(1)

  if (existingBranch) {
    throw createError({ statusCode: 409, statusMessage: 'A branch with this name already exists' })
  }

  // ── Get source branch ──────────────────────────────────────
  let sourceBranch
  if (fromBranchId) {
    const [found] = await db
      .select()
      .from(recipeBranches)
      .where(and(
        eq(recipeBranches.id, fromBranchId),
        eq(recipeBranches.recipeId, recipeId),
      ))
      .limit(1)
    sourceBranch = found
  } else {
    // Default: branch from the default branch
    const [found] = await db
      .select()
      .from(recipeBranches)
      .where(and(
        eq(recipeBranches.recipeId, recipeId),
        eq(recipeBranches.isDefault, true),
      ))
      .limit(1)
    sourceBranch = found
  }

  if (!sourceBranch) {
    throw createError({ statusCode: 404, statusMessage: 'Source branch not found' })
  }

  // ── Create the new branch pointing at the same head commit ─
  const [branch] = await db.insert(recipeBranches).values({
    recipeId,
    name,
    headCommitId: sourceBranch.headCommitId,
    isDefault: false,
  }).$returningId()

  setResponseStatus(event, 201)
  return {
    id: branch.id,
    name,
    headCommitId: sourceBranch.headCommitId,
  }
})
