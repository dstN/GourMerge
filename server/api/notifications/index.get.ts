/**
 * GET /api/notifications?filter=unread|all&page=&pageSize= — the inbox list
 *
 * Chronological order always, never "unread-first": mark-read mutates `read_at` on rows
 * the client already has in view, and an unread-first sort would reshuffle a row across
 * the read/unread boundary mid-session — an offset-paginated page 2 fetch could then skip
 * or repeat rows relative to what page 1 showed. "Show me what's new" is instead the
 * `filter=unread` tab, which self-corrects on mark-read (a row simply stops matching that
 * filter) rather than reshuffling anything.
 *
 * Offset pagination, not cursor-based — no cursor-pagination precedent exists anywhere
 * else in this app (discussions, admin reports, GMR comments are all unpaginated LIMITs),
 * and `filter=unread`'s self-correcting behaviour means offset drift isn't a real risk
 * here specifically.
 *
 * Batched follow-up queries per distinct target kind present, same shape as
 * `admin/reports/index.get.ts` — not a join-sprawl.
 */
import { z } from 'zod'
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import { gourmergeRequests, notifications, recipeDiscussions, recipes, users } from '~~/server/database/schema'

const querySchema = z.object({
  filter: z.enum(['unread', 'all']).default('unread'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const result = querySchema.safeParse(getQuery(event))
  if (!result.success) throw createError({ statusCode: 400, statusMessage: 'Invalid query params' })
  const { filter, page, pageSize } = result.data

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const where = and(
    eq(notifications.recipientId, session.user.id),
    filter === 'unread' ? isNull(notifications.readAt) : undefined
  )

  const rows = await db
    .select({
      id: notifications.id,
      actorId: notifications.actorId,
      kind: notifications.kind,
      recipeId: notifications.recipeId,
      targetKind: notifications.targetKind,
      targetId: notifications.targetId,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  if (rows.length === 0) return { notifications: [], page, pageSize }

  const actorIds = [...new Set(rows.map((r) => r.actorId))]
  const recipeIds = [...new Set(rows.map((r) => r.recipeId))]
  const discussionIds = [...new Set(rows.filter((r) => r.targetKind === 'discussion').map((r) => r.targetId))]
  const gmrIds = [...new Set(rows.filter((r) => r.targetKind === 'gmr').map((r) => r.targetId))]

  const [actorRows, recipeRows, discussionRows, gmrRows] = await Promise.all([
    db
      .select({ id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl })
      .from(users)
      .where(inArray(users.id, actorIds)),
    db
      .select({
        id: recipes.id,
        title: recipes.title,
        slug: recipes.slug,
        visibility: recipes.visibility,
        ownerId: recipes.ownerId,
        ownerUsername: users.username,
      })
      .from(recipes)
      .innerJoin(users, eq(recipes.ownerId, users.id))
      .where(inArray(recipes.id, recipeIds)),
    discussionIds.length
      ? db
          .select({ id: recipeDiscussions.id, title: recipeDiscussions.title })
          .from(recipeDiscussions)
          .where(inArray(recipeDiscussions.id, discussionIds))
      : Promise.resolve([]),
    gmrIds.length
      ? db
          .select({ id: gourmergeRequests.id, title: gourmergeRequests.title })
          .from(gourmergeRequests)
          .where(inArray(gourmergeRequests.id, gmrIds))
      : Promise.resolve([]),
  ])

  const actorMap = new Map(actorRows.map((a) => [a.id, a]))
  const recipeMap = new Map(recipeRows.map((r) => [r.id, r]))
  const discussionMap = new Map(discussionRows.map((d) => [d.id, d]))
  const gmrMap = new Map(gmrRows.map((g) => [g.id, g]))

  // Read-time visibility suppression: a private recipe's notifications are only ever
  // visible to its owner, re-checked on every read since the recipe may have gone private
  // after the notification was created (see server/utils/notifications.ts).
  const visible = rows.filter((r) => {
    const recipe = recipeMap.get(r.recipeId)
    if (!recipe) return false
    return notificationRecipeVisible(recipe.visibility, recipe.ownerId, session.user.id)
  })

  const items = visible.map((r) => {
    const recipe = recipeMap.get(r.recipeId)!
    const actor = actorMap.get(r.actorId) ?? null
    let url = `/${recipe.ownerUsername}/${recipe.slug}`
    let targetTitle: string | null = null
    if (r.targetKind === 'discussion') {
      const d = discussionMap.get(r.targetId)
      targetTitle = d?.title ?? null
      url = `${url}#discussion-${r.targetId}`
    } else if (r.targetKind === 'gmr') {
      const g = gmrMap.get(r.targetId)
      targetTitle = g?.title ?? null
      url = `${url}/gourmerge-requests/${r.targetId}`
    }

    return {
      id: r.id,
      kind: r.kind,
      readAt: r.readAt,
      createdAt: r.createdAt,
      actor,
      recipe: { title: recipe.title, slug: recipe.slug, ownerUsername: recipe.ownerUsername },
      targetTitle,
      url,
    }
  })

  return { notifications: items, page, pageSize }
})
