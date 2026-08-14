/**
 * POST /api/recipes/:id/discussions — open a thread on a recipe or on one of its commits.
 *
 * Anyone signed in may open one on a recipe they can see; that is the point of the
 * feature. Two guards make that safe rather than naive:
 *
 * - `requireVerifiedUser` — the same gate GourMerge Request creation uses, so an
 *   unverified throwaway address cannot post. No-op unless `REQUIRE_EMAIL_VERIFICATION`.
 * - a DB-backed rate limit, because this is the first endpoint in the app where an
 *   arbitrary signed-in user writes arbitrary text into somebody else's page. The bucket
 *   is keyed on the user id, not the IP: the limit protects other people's recipes from
 *   one account, and an IP key would let one account spread across addresses while
 *   punishing a shared NAT.
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { recipeDiscussions, users } from '~~/server/database/schema'

const createSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    body: z.string().trim().min(1).max(10000),
    category: z.enum(['idea', 'question', 'issue', 'praise']).default('idea'),
    /** Anchors the thread to one commit. Absent = a thread about the recipe. */
    commitId: z.number().int().positive().nullable().optional(),
  })
  .strict()

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  await requireVerifiedUser(event)

  const recipeId = Number(getRouterParam(event, 'id'))
  const recipe = await requireVisibleRecipe(event, recipeId)

  const parsed = createSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  // 10 threads / 10 minutes per account, across every recipe.
  await useRateLimit(`discussion:create:${session.user.id}`, { max: 10, windowSeconds: 600 })

  const commitId = parsed.data.commitId ? await requireCommitInRecipe(recipe.id, parsed.data.commitId) : null

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [owner] = await db
    .select({ notificationMutes: users.notificationMutes })
    .from(users)
    .where(eq(users.id, recipe.ownerId))
    .limit(1)

  const insertedId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(recipeDiscussions)
      .values({
        recipeId: recipe.id,
        commitId,
        authorId: session.user.id,
        title: parsed.data.title,
        body: parsed.data.body,
        category: parsed.data.category,
      })
      .$returningId()

    if (!inserted) throw createError({ statusCode: 500, statusMessage: 'Insert failed.' })

    await createNotification(tx, {
      recipientId: recipe.ownerId,
      actorId: session.user.id,
      kind: 'discussion_started',
      recipeId: recipe.id,
      targetKind: 'discussion',
      targetId: inserted.id,
      recipientMutes: owner?.notificationMutes,
    })

    await notifyMentions(tx, {
      body: parsed.data.body,
      authorId: session.user.id,
      recipeId: recipe.id,
      recipeOwnerId: recipe.ownerId,
      recipeVisibility: recipe.visibility,
      targetKind: 'discussion',
      targetId: inserted.id,
    })

    return inserted.id
  })

  setResponseStatus(event, 201)
  return { id: insertedId }
})
