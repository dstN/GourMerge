/**
 * GET /api/recipes/:id/commits — Get commit history for a branch
 *
 * Query params:
 * - branchId (required): which branch to list commits for
 *
 * Walks the `parentCommitId` chain from the branch's head commit rather than
 * filtering flatly by `branch_id`. Creating a branch (`POST .../branches`)
 * points a NEW branch row at the SAME head commit as its source — it does not
 * retag any existing commit rows, exactly like `git checkout -b`. Every commit
 * made before the branch point therefore still carries the SOURCE branch's
 * `branch_id`, so `WHERE branch_id = :branchId` returned nothing (or only
 * commits made after branching) for any branch that wasn't the one those
 * commits were originally made on — the shared upstream history disappeared
 * from a new variant's history view. Ancestry is what "git log <branch>"
 * actually means: everything reachable by following parent pointers from
 * HEAD, regardless of which branch row a given ancestor's `branch_id` points
 * at today. Mirrors the walk `fork.post.ts` already does to replay a
 * recipe's full history into a fork, generalised across all of the recipe's
 * branches since a branch can be created from a non-default one too
 * (`fromBranchId`).
 */
import { eq, inArray, and } from 'drizzle-orm'
import { recipeBranches, recipeCommits, users } from '~~/server/database/schema'

/** Defensive cap on how far back a single history view walks. */
const MAX_HISTORY_DEPTH = 500

export default defineEventHandler(async (event) => {
  const recipeId = Number(getRouterParam(event, 'id'))
  /**
   * The branch was already scoped to the recipe below, but the *recipe* was not scoped to
   * the caller — so a private recipe's whole history (commit messages, author names,
   * timestamps) answered to anyone walking the sequential ids. Commit messages are prose
   * the author wrote assuming nobody outside could read them.
   */
  const recipe = await requireVisibleRecipe(event, recipeId)
  const query = getQuery(event)
  const branchId = Number(query.branchId)

  if (isNaN(branchId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid parameters' })
  }

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [branch] = await db
    .select({ headCommitId: recipeBranches.headCommitId })
    .from(recipeBranches)
    .where(and(eq(recipeBranches.id, branchId), eq(recipeBranches.recipeId, recipe.id)))
    .limit(1)

  if (!branch) {
    throw createError({ statusCode: 404, statusMessage: 'Branch not found' })
  }

  // Ancestry can cross branch boundaries, so the candidate set is every commit
  // on ANY of the recipe's branches, not just the requested one.
  const recipeBranchIds = (
    await db.select({ id: recipeBranches.id }).from(recipeBranches).where(eq(recipeBranches.recipeId, recipe.id))
  ).map((b) => b.id)

  const allCommits = recipeBranchIds.length
    ? await db
        .select({
          id: recipeCommits.id,
          message: recipeCommits.message,
          parentCommitId: recipeCommits.parentCommitId,
          createdAt: recipeCommits.createdAt,
          author: {
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
          },
        })
        .from(recipeCommits)
        .innerJoin(users, eq(recipeCommits.authorId, users.id))
        .where(inArray(recipeCommits.branchId, recipeBranchIds))
    : []

  const commitById = new Map(allCommits.map((c) => [c.id, c]))

  // Walk head → root via parentCommitId — already newest-first, matching the
  // previous `orderBy(desc(createdAt))` intent, but by actual lineage rather
  // than timestamp (which a merge commit could otherwise put out of order).
  const chain: typeof allCommits = []
  let cursor = branch.headCommitId
  const seen = new Set<number>()
  while (cursor != null && commitById.has(cursor) && !seen.has(cursor) && chain.length < MAX_HISTORY_DEPTH) {
    const commit = commitById.get(cursor)!
    chain.push(commit)
    seen.add(cursor)
    cursor = commit.parentCommitId
  }

  return chain
})
