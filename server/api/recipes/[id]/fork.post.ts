/**
 * POST /api/recipes/:id/fork — Fork a recipe
 *
 * Deep-copies the recipe metadata, its default branch, and the FULL commit
 * history of that branch (every commit's ingredient/step snapshot) into a new
 * recipe owned by the current user. Commit lineage (parentCommitId), original
 * authors and timestamps are preserved so the fork carries the source's history.
 * Increments forkCount on the original in the same transaction.
 */
import { eq, and, sql, inArray } from 'drizzle-orm'
import {
  recipes,
  recipeBranches,
  recipeCommits,
  recipeCommitIngredients,
  recipeCommitSteps,
  users,
} from '~~/server/database/schema'
import { generatePublicId } from '~~/server/utils/uuid'

/** Defensive cap on history length copied per fork. */
const MAX_FORK_HISTORY = 1000

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

  // ── Load original default branch + its full commit history ───
  const [defaultBranch] = await db
    .select({ id: recipeBranches.id, headCommitId: recipeBranches.headCommitId })
    .from(recipeBranches)
    .where(and(eq(recipeBranches.recipeId, recipeId), eq(recipeBranches.isDefault, true)))
    .limit(1)

  // All commits on the default branch, then ordered root→head via the
  // parentCommitId chain (parents must be inserted before their children).
  const branchCommits = defaultBranch
    ? await db.select().from(recipeCommits).where(eq(recipeCommits.branchId, defaultBranch.id))
    : []
  const commitById = new Map(branchCommits.map((c) => [c.id, c]))

  const orderedDesc: (typeof recipeCommits.$inferSelect)[] = []
  let cursor = defaultBranch?.headCommitId ?? null
  const seen = new Set<number>()
  while (cursor != null && commitById.has(cursor) && !seen.has(cursor) && orderedDesc.length < MAX_FORK_HISTORY) {
    const c = commitById.get(cursor)!
    orderedDesc.push(c)
    seen.add(cursor)
    cursor = c.parentCommitId
  }
  const orderedCommits = orderedDesc.reverse() // root → head

  // Bulk-load ingredient/step snapshots for the copied commits.
  const copiedIds = orderedCommits.map((c) => c.id)
  const [allIngredients, allSteps] = copiedIds.length
    ? await Promise.all([
        db.select().from(recipeCommitIngredients).where(inArray(recipeCommitIngredients.commitId, copiedIds)),
        db.select().from(recipeCommitSteps).where(inArray(recipeCommitSteps.commitId, copiedIds)),
      ])
    : [[], []]

  const ingredientsByCommit = new Map<number, typeof allIngredients>()
  for (const row of allIngredients) {
    const list = ingredientsByCommit.get(row.commitId) ?? []
    list.push(row)
    ingredientsByCommit.set(row.commitId, list)
  }
  const stepsByCommit = new Map<number, typeof allSteps>()
  for (const row of allSteps) {
    const list = stepsByCommit.get(row.commitId) ?? []
    list.push(row)
    stepsByCommit.set(row.commitId, list)
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
      .values({ recipeId: fork.id, name: 'main', isDefault: true })
      .$returningId()

    if (!forkBranch) throw createError({ statusCode: 500, statusMessage: 'Insert failed.' })

    // 3. Replay the commit history onto the fork branch, preserving lineage,
    //    authors and timestamps. Commits are inserted one-by-one because each
    //    child's parentCommitId references the freshly-created parent id.
    const idMap = new Map<number, number>() // old commit id → new commit id
    const newIngredientRows: (typeof recipeCommitIngredients.$inferInsert)[] = []
    const newStepRows: (typeof recipeCommitSteps.$inferInsert)[] = []

    for (const c of orderedCommits) {
      const newParent = c.parentCommitId != null ? (idMap.get(c.parentCommitId) ?? null) : null
      const newMergeSource = c.mergeSourceCommitId != null ? (idMap.get(c.mergeSourceCommitId) ?? null) : null
      const [inserted] = await tx
        .insert(recipeCommits)
        .values({
          branchId: forkBranch.id,
          parentCommitId: newParent,
          authorId: c.authorId,
          message: c.message,
          isMerge: c.isMerge,
          mergeSourceCommitId: newMergeSource,
          createdAt: c.createdAt,
        })
        .$returningId()
      if (!inserted) throw createError({ statusCode: 500, statusMessage: 'Insert failed.' })
      idMap.set(c.id, inserted.id)

      for (const ing of ingredientsByCommit.get(c.id) ?? []) {
        newIngredientRows.push({
          commitId: inserted.id,
          ingredientId: ing.ingredientId,
          quantity: ing.quantity,
          unit: ing.unit,
          notes: ing.notes ?? undefined,
          sortOrder: ing.sortOrder,
        })
      }
      for (const step of stepsByCommit.get(c.id) ?? []) {
        newStepRows.push({
          commitId: inserted.id,
          sortOrder: step.sortOrder,
          content: step.content,
          contentTranslations: step.contentTranslations,
        })
      }
    }

    if (newIngredientRows.length) await tx.insert(recipeCommitIngredients).values(newIngredientRows)
    if (newStepRows.length) await tx.insert(recipeCommitSteps).values(newStepRows)

    // 4. Point the fork's branch head at the copied head commit
    const newHeadId = defaultBranch?.headCommitId != null ? (idMap.get(defaultBranch.headCommitId) ?? null) : null
    if (newHeadId != null) {
      await tx.update(recipeBranches).set({ headCommitId: newHeadId }).where(eq(recipeBranches.id, forkBranch.id))
    }

    // 5. Increment original recipe's forkCount atomically
    await tx
      .update(recipes)
      .set({ forkCount: sql`${recipes.forkCount} + 1` })
      .where(eq(recipes.id, recipeId))

    return { id: fork.id, slug, branchId: forkBranch.id, commitsCopied: orderedCommits.length }
  })

  setResponseStatus(event, 201)
  return {
    id: result.id,
    slug: result.slug,
    owner: { username: owner.username },
    forkedFromRecipeId: recipeId,
    commitsCopied: result.commitsCopied,
  }
})
