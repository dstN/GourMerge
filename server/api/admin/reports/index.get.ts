/**
 * GET /api/admin/reports — Every report, regardless of the target's own visibility.
 *
 * The one place `resolveReportTarget`'s visibility check is deliberately NOT applied: an
 * admin has to be able to see a report on a private recipe to act on it at all, which is
 * exactly the access `requireAdmin` gates.
 *
 * Query: `?status=open|actioned|dismissed` (default `open` — the actual queue; the other
 * two are for the "show me what already got handled" view, not the default landing state).
 */
import { desc, eq, inArray } from 'drizzle-orm'
import {
  ingredients,
  recipeDiscussionComments,
  recipeDiscussions,
  recipes,
  reports,
  users,
} from '~~/server/database/schema'

const STATUSES = ['open', 'actioned', 'dismissed'] as const

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const statusParam = getQuery(event).status
  const status = STATUSES.includes(statusParam as (typeof STATUSES)[number])
    ? (statusParam as (typeof STATUSES)[number])
    : 'open'

  const rows = await db
    .select({
      id: reports.id,
      targetKind: reports.targetKind,
      targetId: reports.targetId,
      reporterId: reports.reporterId,
      reason: reports.reason,
      note: reports.note,
      status: reports.status,
      createdAt: reports.createdAt,
    })
    .from(reports)
    .where(eq(reports.status, status))
    .orderBy(desc(reports.createdAt))
    .limit(200)

  if (rows.length === 0) return []

  // Batch-resolve a human-readable label per target kind — one query per kind touched,
  // not one per row.
  const idsByKind: Record<string, number[]> = {}
  const reporterIds = new Set<number>()
  for (const r of rows) {
    ;(idsByKind[r.targetKind] ??= []).push(r.targetId)
    reporterIds.add(r.reporterId)
  }

  const [reporterRows, userRows, commentRows, ingredientRows] = await Promise.all([
    db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(inArray(users.id, [...reporterIds])),
    idsByKind.user
      ? db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, idsByKind.user))
      : Promise.resolve([]),
    idsByKind.discussion_comment
      ? db
          .select({
            id: recipeDiscussionComments.id,
            body: recipeDiscussionComments.body,
            recipeId: recipeDiscussions.recipeId,
          })
          .from(recipeDiscussionComments)
          .innerJoin(recipeDiscussions, eq(recipeDiscussionComments.discussionId, recipeDiscussions.id))
          .where(inArray(recipeDiscussionComments.id, idsByKind.discussion_comment))
      : Promise.resolve([]),
    idsByKind.ingredient
      ? db.select({ id: ingredients.id, name: ingredients.name }).from(ingredients).where(inArray(ingredients.id, idsByKind.ingredient))
      : Promise.resolve([]),
  ])

  // Recipes are needed for direct recipe/image targets AND, separately, for whichever
  // recipe each reported comment lives on — two different id spaces, gathered into one
  // set so this is still a single query rather than one per comment.
  const recipeIds = new Set<number>([...(idsByKind.recipe || []), ...(idsByKind.image || [])])
  for (const c of commentRows) recipeIds.add(c.recipeId)

  const recipeRows = recipeIds.size
    ? await db
        .select({ id: recipes.id, title: recipes.title, slug: recipes.slug, ownerUsername: users.username })
        .from(recipes)
        .innerJoin(users, eq(recipes.ownerId, users.id))
        .where(inArray(recipes.id, [...recipeIds]))
    : []

  const reporterMap = new Map(reporterRows.map((u) => [u.id, u.username]))
  const recipeMap = new Map(recipeRows.map((r) => [r.id, r]))
  const userMap = new Map(userRows.map((u) => [u.id, u.username]))
  const commentMap = new Map(commentRows.map((c) => [c.id, c]))
  const ingredientMap = new Map(ingredientRows.map((i) => [i.id, i.name]))

  return rows.map((r) => {
    let label = `#${r.targetId}`
    let url: string | null = null

    if (r.targetKind === 'recipe' || r.targetKind === 'image') {
      const recipe = recipeMap.get(r.targetId)
      if (recipe) {
        label = recipe.title
        url = `/${recipe.ownerUsername}/${recipe.slug}`
      }
    } else if (r.targetKind === 'user') {
      const username = userMap.get(r.targetId)
      if (username) {
        label = `@${username}`
        url = `/${username}`
      }
    } else if (r.targetKind === 'discussion_comment') {
      const comment = commentMap.get(r.targetId)
      if (comment) {
        label = comment.body.slice(0, 80)
        const recipe = recipeMap.get(comment.recipeId)
        // Not resolved in the batch above (discussion_comment ids live in a different id
        // space than recipe ids) — a targeted lookup only when a comment actually matched.
        url = recipe ? `/${recipe.ownerUsername}/${recipe.slug}` : null
      }
    } else if (r.targetKind === 'ingredient') {
      label = ingredientMap.get(r.targetId) ?? label
    }

    return {
      id: r.id,
      targetKind: r.targetKind,
      targetId: r.targetId,
      reporterUsername: reporterMap.get(r.reporterId) ?? null,
      reason: r.reason,
      note: r.note,
      status: r.status,
      createdAt: r.createdAt,
      target: { label, url },
    }
  })
})
