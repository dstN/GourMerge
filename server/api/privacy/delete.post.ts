/**
 * POST /api/privacy/delete — execute an erasure request (GDPR Art. 17).
 *
 * The user row is ANONYMISED IN PLACE rather than deleted. Four FKs into
 * `users` are NOT NULL and RESTRICT — recipes.owner_id, recipe_commits.author_id,
 * gourmerge_requests.author_id, gm_request_comments.author_id — and a fork copies
 * commits keeping the ORIGINAL author_id. So a hard DELETE would either fail on
 * the constraint or require ripping rows out of somebody else's recipe history,
 * which is their data, not ours to destroy. Overwriting the identifying columns
 * removes the personal data while leaving those references structurally valid:
 * GitHub's `ghost`, but per-user, so two deleted accounts remain distinguishable
 * in a discussion thread.
 *
 * `deleteRecipes` is the user's choice from the confirmation screen.
 */
import { randomBytes } from 'node:crypto'
import { eq, and, or, inArray } from 'drizzle-orm'
import { z } from 'zod'
import {
  users,
  recipes,
  recipeBranches,
  gourmergeRequests,
  dataRequests,
  contactMessages,
} from '~~/server/database/schema'
import { resolveDataRequest } from '~~/server/utils/dataRequest'
import { useRateLimit, getRateLimitKey } from '~~/server/utils/rateLimit'
import { logger } from '~~/server/utils/logger'

const bodySchema = z.object({
  token: z.string().min(32).max(128),
  deleteRecipes: z.boolean(),
})

export default defineEventHandler(async (event) => {
  await useRateLimit(getRateLimitKey(event, 'privacy:delete'), { max: 5, windowSeconds: 3600 })

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid request.' })
  const { token, deleteRecipes } = parsed.data

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Service unavailable.' })

  const req = await resolveDataRequest(db, token, 'deletion')

  // Confirming via the emailed link is the proof of ownership. Without it this
  // endpoint would erase an account for anyone who could reach it.
  if (!req.confirmedAt) {
    throw createError({ statusCode: 400, statusMessage: 'This request has not been confirmed yet.' })
  }

  const userId = req.userId
  const originalEmail = req.email

  await db.transaction(async (tx) => {
    if (deleteRecipes) {
      const owned = await tx.select({ id: recipes.id }).from(recipes).where(eq(recipes.ownerId, userId))
      const recipeIds = owned.map((r) => r.id)

      if (recipeIds.length > 0) {
        // Same pre-delete dance as the single-recipe endpoint, because the same
        // two RESTRICT relations block the cascade.

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
      }
    }

    // Contact-form messages are linked only by address, so they are matched and
    // removed here regardless of the recipe choice — they are purely personal
    // data with no value to anyone else.
    await tx.delete(contactMessages).where(eq(contactMessages.email, originalEmail))

    // Anonymise. The suffix keeps username/email unique without leaking the old
    // values, and the random part stops anyone correlating deleted-<id> back to
    // a sequential account id.
    const suffix = `${userId}-${randomBytes(4).toString('hex')}`
    await tx
      .update(users)
      .set({
        username: `deleted-${suffix}`,
        email: `deleted-${suffix}@invalid`,
        displayName: null,
        bio: null,
        avatarUrl: null,
        // Not a real bcrypt hash, so no password can ever verify against it.
        passwordHash: 'account-erased',
        emailVerifiedAt: null,
        anonymizedAt: new Date(),
      })
      .where(eq(users.id, userId))

    // Close this request, and drop any other pending ones for the account —
    // an outstanding export token must not survive the erasure.
    await tx.update(dataRequests).set({ completedAt: new Date() }).where(eq(dataRequests.id, req.id))
    await tx.delete(dataRequests).where(and(eq(dataRequests.userId, userId), eq(dataRequests.type, 'export')))
  })

  // Deliberately no email address in the log line: the point was to erase it.
  logger.info('gdpr erasure completed', { userId, deletedRecipes: deleteRecipes })

  return { deleted: true, recipesDeleted: deleteRecipes }
})
