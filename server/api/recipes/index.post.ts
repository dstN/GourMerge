/**
 * POST /api/recipes — Create a new recipe (repository)
 *
 * Creates the recipe + default 'main' branch + initial empty commit.
 * This mirrors `git init` — every repo starts with a branch and a root commit.
 */
import { z } from 'zod'
import { recipes, recipeBranches, recipeCommits } from '~~/server/database/schema'

const createRecipeSchema = z.object({
  title: z.string().min(2).max(300),
  description: z.string().max(5000).optional(),
  servings: z.number().int().min(1).max(100).default(4),
  prepTimeMinutes: z.number().int().min(0).max(1440).optional(),
  cookTimeMinutes: z.number().int().min(0).max(1440).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  visibility: z.enum(['public', 'private']).default('public'),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const body = await readBody(event)

  // ── Validate ────────────────────────────────────────────────
  const result = createRecipeSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Validation failed',
      data: result.error.flatten().fieldErrors,
    })
  }

  const data = result.data
  const db = useDrizzle()

  // ── Create recipe ───────────────────────────────────────────
  const [recipe] = await db.insert(recipes).values({
    ownerId: session.user.id,
    title: data.title,
    description: data.description,
    servings: data.servings,
    prepTimeMinutes: data.prepTimeMinutes,
    cookTimeMinutes: data.cookTimeMinutes,
    difficulty: data.difficulty,
    visibility: data.visibility,
  }).$returningId()

  // ── Create default "main" branch ────────────────────────────
  const [branch] = await db.insert(recipeBranches).values({
    recipeId: recipe.id,
    name: 'main',
    isDefault: true,
  }).$returningId()

  // ── Create initial (empty) commit ───────────────────────────
  const [commit] = await db.insert(recipeCommits).values({
    branchId: branch.id,
    authorId: session.user.id,
    message: 'Initial commit 🍳',
    parentCommitId: null,
  }).$returningId()

  // ── Update branch head ──────────────────────────────────────
  await db
    .update(recipeBranches)
    .set({ headCommitId: commit.id })
    .where(eq(recipeBranches.id, branch.id))

  setResponseStatus(event, 201)
  return {
    id: recipe.id,
    branchId: branch.id,
    commitId: commit.id,
  }
})

// Need eq for the update
import { eq } from 'drizzle-orm'
