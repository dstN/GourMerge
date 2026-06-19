/**
 * POST /api/recipes/:id/fork — Fork a recipe
 *
 * Deep-copies the recipe metadata, default branch, and head commit snapshot
 * (ingredients + steps) into a new recipe owned by the current user.
 * Increments forkCount on the original in the same transaction.
 */
import { eq, and, sql } from 'drizzle-orm'
import {
  recipes,
  recipeBranches,
  recipeCommits,
  recipeCommitIngredients,
  recipeCommitSteps,
  users,
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

  // ── Load original recipe ─────────────────────────────────────
  const [original] = await db
    .select({
      id: recipes.id,
      ownerId: recipes.ownerId,
      title: recipes.title,
      description: recipes.description,
      servings: recipes.servings,
      prepTimeMinutes: recipes.prepTimeMinutes,
      cookTimeMinutes: recipes.cookTimeMinutes,
      difficulty: recipes.difficulty,
      visibility: recipes.visibility,
    })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1)

  if (!original) {
    throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
  }

  // Private recipes can only be forked by the owner
  if (original.visibility === 'private' && original.ownerId !== session.user.id) {
    throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
  }

  // Cannot fork your own recipe into your own namespace (would create a slug conflict and is pointless)
  if (original.ownerId === session.user.id) {
    throw createError({ statusCode: 422, statusMessage: 'Cannot fork your own recipe' })
  }

  // ── Resolve fork owner username for response ─────────────────
  const [owner] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)

  if (!owner) {
    throw createError({ statusCode: 401, statusMessage: 'User not found' })
  }

  // ── Resolve unique slug for the fork ────────────────────────
  let slug = generateSlug(original.title)
  let suffix = 0
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

  // ── Load original default branch + head snapshot ─────────────
  const [defaultBranch] = await db
    .select({ id: recipeBranches.id, headCommitId: recipeBranches.headCommitId })
    .from(recipeBranches)
    .where(and(eq(recipeBranches.recipeId, recipeId), eq(recipeBranches.isDefault, true)))
    .limit(1)

  let sourceIngredients: (typeof recipeCommitIngredients.$inferSelect)[] = []
  let sourceSteps: (typeof recipeCommitSteps.$inferSelect)[] = []

  if (defaultBranch?.headCommitId) {
    ;[sourceIngredients, sourceSteps] = await Promise.all([
      db.select().from(recipeCommitIngredients).where(eq(recipeCommitIngredients.commitId, defaultBranch.headCommitId)),
      db.select().from(recipeCommitSteps).where(eq(recipeCommitSteps.commitId, defaultBranch.headCommitId)),
    ])
  }

  // ── Transaction: deep copy + counter increment ───────────────
  const result = await db.transaction(async (tx) => {
    // 1. Insert the forked recipe
    const [fork] = await tx
      .insert(recipes)
      .values({
        publicId: generatePublicId(),
        ownerId: session.user.id,
        title: original.title,
        slug,
        description: original.description,
        servings: original.servings,
        prepTimeMinutes: original.prepTimeMinutes ?? undefined,
        cookTimeMinutes: original.cookTimeMinutes ?? undefined,
        difficulty: original.difficulty,
        visibility: original.visibility,
        forkedFromRecipeId: recipeId,
      })
      .$returningId()

    if (!fork) throw createError({ statusCode: 500, statusMessage: 'Insert failed.' })

    // 2. Create default branch for fork
    const [forkBranch] = await tx
      .insert(recipeBranches)
      .values({
        recipeId: fork.id,
        name: 'main',
        isDefault: true,
      })
      .$returningId()

    if (!forkBranch) throw createError({ statusCode: 500, statusMessage: 'Insert failed.' })

    // 3. Copy head commit snapshot (fork point)
    const [forkCommit] = await tx
      .insert(recipeCommits)
      .values({
        branchId: forkBranch.id,
        authorId: session.user.id,
        message: `Forked from original recipe`,
        parentCommitId: null,
      })
      .$returningId()

    if (!forkCommit) throw createError({ statusCode: 500, statusMessage: 'Insert failed.' })

    // 4. Copy ingredients (reference the same master ingredient IDs)
    if (sourceIngredients.length > 0) {
      await tx.insert(recipeCommitIngredients).values(
        sourceIngredients.map(({ ingredientId, quantity, unit, notes, sortOrder }) => ({
          commitId: forkCommit.id,
          ingredientId,
          quantity,
          unit,
          notes: notes ?? undefined,
          sortOrder,
        }))
      )
    }

    // 5. Copy steps
    if (sourceSteps.length > 0) {
      await tx.insert(recipeCommitSteps).values(
        sourceSteps.map(({ sortOrder, content }) => ({
          commitId: forkCommit.id,
          sortOrder,
          content,
        }))
      )
    }

    // 6. Set fork's branch head
    await tx.update(recipeBranches).set({ headCommitId: forkCommit.id }).where(eq(recipeBranches.id, forkBranch.id))

    // 7. Increment original recipe's forkCount atomically
    await tx
      .update(recipes)
      .set({ forkCount: sql`${recipes.forkCount} + 1` })
      .where(eq(recipes.id, recipeId))

    return { id: fork.id, slug, branchId: forkBranch.id }
  })

  setResponseStatus(event, 201)
  return {
    id: result.id,
    slug: result.slug,
    owner: { username: owner.username },
    forkedFromRecipeId: recipeId,
  }
})
