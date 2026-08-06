/**
 * Hard-delete a user account, reassigning surviving attribution to the ghost.
 *
 * ## Why this is not a plain `DELETE FROM users`
 *
 * Four FKs point at `users.id` as **NOT NULL with NO ACTION** (= RESTRICT in MySQL):
 * `recipes.owner_id`, `recipe_commits.author_id`, `gourmerge_requests.author_id` and
 * `gm_request_comments.author_id`. On top of that, `fork.post.ts` copies commits
 * keeping the **original** `author_id`, so a stranger's fork legitimately contains
 * rows authored by the departing user. A raw delete therefore either fails on the
 * constraint or destroys rows inside somebody else's recipe history.
 *
 * ## The approach
 *
 * A single shared tombstone account (`users.is_ghost`, username `ghost`) inherits
 * that orphaned attribution — the same pattern GitHub uses. The user's *own* content
 * is deleted outright; only their fingerprints inside other people's forks and
 * threads survive, and those now read as the anonymous ghost.
 *
 * The ghost is not loginable: its `password_hash` is a sentinel no password can
 * verify against, and its email is at an `.invalid` domain.
 *
 * Every caller — the self-service GDPR erasure and the nightly inactivity job —
 * must go through here, or the two paths will drift on exactly the constraints that
 * make this hard.
 */
import { and, eq, inArray, or } from 'drizzle-orm'
import {
  contactMessages,
  gourmergeRequestComments,
  gourmergeRequests,
  recipeBranches,
  recipeCommits,
  recipes,
  users,
} from '~~/server/database/schema'

const GHOST_USERNAME = 'ghost'

type Db = NonNullable<ReturnType<typeof useDrizzle>>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * Resolve the singleton ghost id, creating the row if a deployment predates the
 * migration that seeds it. Idempotent.
 */
export async function ensureGhostUser(db: Db | Tx): Promise<number> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.isGhost, true)).limit(1)
  if (existing) return existing.id

  await db.insert(users).values({
    username: GHOST_USERNAME,
    email: `${GHOST_USERNAME}@gourmerge.invalid`,
    // Not a bcrypt hash, so no password can ever verify against it.
    passwordHash: 'ghost-account-not-loginable',
    displayName: null,
    isGhost: true,
  })

  const [created] = await db.select({ id: users.id }).from(users).where(eq(users.isGhost, true)).limit(1)
  if (!created) throw new Error('Failed to create the ghost user')
  return created.id
}

export interface HardDeleteResult {
  recipesDeleted: number
  commitsReassigned: number
  requestsReassigned: number
  commentsReassigned: number
}

/**
 * Delete `userId` for real.
 *
 * @param deleteOwnedRecipes When false, the user's recipes are handed to the ghost
 *   instead of deleted — used by the self-service flow, where the departing user
 *   chooses whether their public contributions stay up. The nightly inactivity job
 *   passes `true`: nobody is there to ask.
 */
export async function hardDeleteUser(db: Db, userId: number, deleteOwnedRecipes: boolean): Promise<HardDeleteResult> {
  const result: HardDeleteResult = {
    recipesDeleted: 0,
    commitsReassigned: 0,
    requestsReassigned: 0,
    commentsReassigned: 0,
  }

  await db.transaction(async (tx) => {
    const ghostId = await ensureGhostUser(tx)
    if (ghostId === userId) throw new Error('Refusing to delete the ghost account')

    const owned = await tx.select({ id: recipes.id }).from(recipes).where(eq(recipes.ownerId, userId))
    const recipeIds = owned.map((r) => r.id)

    // ── The user's own email address, needed before the row disappears ──
    const [victim] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1)

    if (deleteOwnedRecipes && recipeIds.length > 0) {
      // Same pre-delete dance as the single-recipe endpoint, because the same two
      // RESTRICT relations block the cascade.

      // 1. Forks pointing at these recipes as their origin become standalone.
      await tx.update(recipes).set({ forkedFromRecipeId: null }).where(inArray(recipes.forkedFromRecipeId, recipeIds))

      // 2. Cross-recipe GMRs referencing these branches would block the
      //    recipe_branches cascade.
      const branches = await tx
        .select({ id: recipeBranches.id })
        .from(recipeBranches)
        .where(inArray(recipeBranches.recipeId, recipeIds))

      if (branches.length > 0) {
        const branchIds = branches.map((b) => b.id)
        await tx
          .delete(gourmergeRequests)
          .where(
            or(
              inArray(gourmergeRequests.sourceBranchId, branchIds),
              inArray(gourmergeRequests.targetBranchId, branchIds)
            )
          )
      }

      await tx.delete(recipes).where(inArray(recipes.id, recipeIds))
      result.recipesDeleted = recipeIds.length
    } else if (recipeIds.length > 0) {
      // Keep the recipes, but they can no longer belong to a row that is about to
      // vanish. The ghost becomes the owner, so they show as anonymous.
      await tx.update(recipes).set({ ownerId: ghostId }).where(inArray(recipes.id, recipeIds))
    }

    /**
     * Reassign whatever attribution is left. After the step above these are rows
     * living inside OTHER users' recipes — a commit copied into their fork, a
     * GourMerge Request they received, a comment in their thread. Deleting those
     * would corrupt someone else's history; nulling is impossible (NOT NULL); so
     * they become the ghost's.
     */
    const commits = await tx.update(recipeCommits).set({ authorId: ghostId }).where(eq(recipeCommits.authorId, userId))
    const requests = await tx
      .update(gourmergeRequests)
      .set({ authorId: ghostId })
      .where(eq(gourmergeRequests.authorId, userId))
    const comments = await tx
      .update(gourmergeRequestComments)
      .set({ authorId: ghostId })
      .where(eq(gourmergeRequestComments.authorId, userId))

    // mysql2 reports affected rows on the result header; shape varies, so read
    // defensively — these counts are for the audit log, not for control flow.
    result.commitsReassigned = readAffected(commits)
    result.requestsReassigned = readAffected(requests)
    result.commentsReassigned = readAffected(comments)

    // Contact-form messages are linked only by address, so they are matched here
    // and removed regardless of the recipe choice — purely personal data of no
    // value to anyone else.
    if (victim?.email) {
      await tx.delete(contactMessages).where(eq(contactMessages.email, victim.email))
    }

    // Everything else — stars, verification/reset tokens, data requests, the TOTP
    // enrolment and its recovery codes — hangs off `ON DELETE CASCADE`, so this one
    // statement removes them with the row.
    await tx.delete(users).where(and(eq(users.id, userId), eq(users.isGhost, false)))
  })

  return result
}

function readAffected(res: unknown): number {
  if (Array.isArray(res)) {
    const header = res[0] as { affectedRows?: number } | undefined
    return header?.affectedRows ?? 0
  }
  return (res as { affectedRows?: number })?.affectedRows ?? 0
}
