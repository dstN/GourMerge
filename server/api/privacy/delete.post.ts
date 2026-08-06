/**
 * POST /api/privacy/delete — execute an erasure request (GDPR Art. 17).
 *
 * The account row is **hard-deleted**. Four FKs into `users` are NOT NULL and
 * RESTRICT — `recipes.owner_id`, `recipe_commits.author_id`,
 * `gourmerge_requests.author_id`, `gm_request_comments.author_id` — and a fork copies
 * commits keeping the ORIGINAL author_id, so a bare `DELETE` cannot work. The
 * attribution that legitimately lives inside *other people's* recipes is therefore
 * reassigned to a single shared anonymous ghost account before the row is removed;
 * see `server/utils/hardDeleteUser.ts` for the full reasoning.
 *
 * (This previously anonymised the row in place. Hard deletion is the stronger
 * reading of Art. 17, and the inactivity job needs the same behaviour, so both
 * paths now share one implementation.)
 *
 * `deleteRecipes` is the user's choice from the confirmation screen: their own
 * recipes are either deleted outright or handed to the ghost, so public
 * contributions can survive anonymously if they want that.
 */
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { dataRequests } from '~~/server/database/schema'
import { resolveDataRequest } from '~~/server/utils/dataRequest'
import { useRateLimit, getRateLimitKey } from '~~/server/utils/rateLimit'
import { logger } from '~~/server/utils/logger'
import { hardDeleteUser } from '~~/server/utils/hardDeleteUser'

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

  // Close the request BEFORE the delete: `data_requests` cascades on user delete, so
  // afterwards there is no row left to mark completed. Dropping the account's other
  // pending requests here also ensures no outstanding export token survives.
  await db.update(dataRequests).set({ completedAt: new Date() }).where(eq(dataRequests.id, req.id))
  await db.delete(dataRequests).where(and(eq(dataRequests.userId, userId), eq(dataRequests.type, 'export')))

  const outcome = await hardDeleteUser(db, userId, deleteRecipes)

  // Deliberately no email address in the log line: the point was to erase it.
  logger.info('gdpr erasure completed', { userId, deletedRecipes: deleteRecipes, ...outcome })

  return { deleted: true, recipesDeleted: deleteRecipes }
})
