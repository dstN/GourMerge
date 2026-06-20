/**
 * POST /api/recipes — Create a new recipe (repository)
 *
 * Creates the recipe + default 'main' branch + initial empty commit
 * inside a single DB transaction. This mirrors `git init` — every
 * repo starts with a branch and a root commit.
 *
 * Returns the owner username + slug for GitHub-style URL navigation.
 */
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { recipes, recipeBranches, recipeCommits, users } from '~~/server/database/schema'
import { generatePublicId } from '~~/server/utils/uuid'

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
  // Publishing a public recipe is gated on a verified email (no-op unless
  // REQUIRE_EMAIL_VERIFICATION=true). Private recipes are always allowed.
  if (data.visibility === 'public') await requireVerifiedUser(event)
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // ── Generate unique slug ────────────────────────────────────
  let slug = generateSlug(data.title)
  let suffix = 0

  // Check for collisions and append -1, -2, etc. if needed
  while (true) {
    const candidate = suffix === 0 ? slug : `${slug}-${suffix}`
    const [existing] = await db
      .select({ id: recipes.id })
      .from(recipes)
      .where(and(eq(recipes.ownerId, session.user.id), eq(recipes.slug, candidate)))
      .limit(1)

    if (!existing) {
      slug = candidate
      break
    }
    suffix++
  }

  // ── Get owner username for response ─────────────────────────
  const [owner] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)

  // ── Transaction: recipe + branch + commit ───────────────────
  // All-or-nothing: if any step fails, everything rolls back.
  const txResult = await db.transaction(async (tx) => {
    // 1. Create recipe with slug + UUIDv7 public_id
    const [recipe] = await tx
      .insert(recipes)
      .values({
        publicId: generatePublicId(),
        ownerId: session.user.id,
        title: data.title,
        slug,
        description: data.description,
        servings: data.servings,
        prepTimeMinutes: data.prepTimeMinutes,
        cookTimeMinutes: data.cookTimeMinutes,
        difficulty: data.difficulty,
        visibility: data.visibility,
      })
      .$returningId()

    if (!recipe) throw createError({ statusCode: 500, statusMessage: 'Insert failed.' })

    // 2. Create default "main" branch
    const [branch] = await tx
      .insert(recipeBranches)
      .values({
        recipeId: recipe.id,
        name: 'main',
        isDefault: true,
      })
      .$returningId()

    if (!branch) throw createError({ statusCode: 500, statusMessage: 'Insert failed.' })

    // 3. Create initial (empty) commit
    const [commit] = await tx
      .insert(recipeCommits)
      .values({
        branchId: branch.id,
        authorId: session.user.id,
        message: 'Initial commit 🍳',
        parentCommitId: null,
      })
      .$returningId()

    if (!commit) throw createError({ statusCode: 500, statusMessage: 'Insert failed.' })

    // 4. Update branch head pointer
    await tx.update(recipeBranches).set({ headCommitId: commit.id }).where(eq(recipeBranches.id, branch.id))

    return {
      id: recipe.id,
      slug,
      owner: { username: owner!.username },
      branchId: branch.id,
      commitId: commit.id,
    }
  })

  setResponseStatus(event, 201)
  return txResult
})
