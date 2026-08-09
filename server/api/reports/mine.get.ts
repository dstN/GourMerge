/**
 * GET /api/reports/mine — Reports about content the caller is responsible for.
 *
 * "Responsible for" per `resolveReportTarget`'s docblock: the recipe owner, a discussion
 * comment's author or the recipe owner it lives on, the ingredient's creator. Never reports
 * where the caller themselves is the *reported* target (`target_kind = 'user'`) — those are
 * admin-only, deliberately, so this is not a way to find out who reported you.
 *
 * One small query per reportable kind rather than a generic per-row resolve: at the volume
 * this feature will see, four simple joins are both cheaper and easier to read than looping
 * `resolveReportTarget` over every row.
 */
import { and, eq, or } from 'drizzle-orm'
import { ingredients, recipeDiscussionComments, recipeDiscussions, recipes, reports, users } from '~~/server/database/schema'

interface MineReport {
  id: number
  targetKind: string
  targetId: number
  reason: string
  note: string | null
  status: string
  createdAt: string | Date
  target: { label: string; url: string | null }
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })
  const uid = session.user.id

  const recipeColumns = {
    id: reports.id,
    targetId: reports.targetId,
    reason: reports.reason,
    note: reports.note,
    status: reports.status,
    createdAt: reports.createdAt,
    title: recipes.title,
    slug: recipes.slug,
    ownerUsername: users.username,
  }

  const [recipeReports, imageReports, ingredientReports, commentReports] = await Promise.all([
    db
      .select(recipeColumns)
      .from(reports)
      .innerJoin(recipes, eq(reports.targetId, recipes.id))
      .innerJoin(users, eq(recipes.ownerId, users.id))
      .where(and(eq(reports.targetKind, 'recipe'), eq(recipes.ownerId, uid))),

    db
      .select(recipeColumns)
      .from(reports)
      .innerJoin(recipes, eq(reports.targetId, recipes.id))
      .innerJoin(users, eq(recipes.ownerId, users.id))
      .where(and(eq(reports.targetKind, 'image'), eq(recipes.ownerId, uid))),

    db
      .select({
        id: reports.id,
        targetId: reports.targetId,
        reason: reports.reason,
        note: reports.note,
        status: reports.status,
        createdAt: reports.createdAt,
        name: ingredients.name,
      })
      .from(reports)
      .innerJoin(ingredients, eq(reports.targetId, ingredients.id))
      .where(and(eq(reports.targetKind, 'ingredient'), eq(ingredients.createdBy, uid))),

    db
      .select(recipeColumns)
      .from(reports)
      .innerJoin(recipeDiscussionComments, eq(reports.targetId, recipeDiscussionComments.id))
      .innerJoin(recipeDiscussions, eq(recipeDiscussionComments.discussionId, recipeDiscussions.id))
      .innerJoin(recipes, eq(recipeDiscussions.recipeId, recipes.id))
      .innerJoin(users, eq(recipes.ownerId, users.id))
      .where(
        and(
          eq(reports.targetKind, 'discussion_comment'),
          or(eq(recipeDiscussionComments.authorId, uid), eq(recipes.ownerId, uid))
        )
      ),
  ])

  const results: MineReport[] = [
    ...recipeReports.map((r) => ({
      id: r.id,
      targetKind: 'recipe',
      targetId: r.targetId,
      reason: r.reason,
      note: r.note,
      status: r.status,
      createdAt: r.createdAt,
      target: { label: r.title, url: `/${r.ownerUsername}/${r.slug}` },
    })),
    ...imageReports.map((r) => ({
      id: r.id,
      targetKind: 'image',
      targetId: r.targetId,
      reason: r.reason,
      note: r.note,
      status: r.status,
      createdAt: r.createdAt,
      target: { label: r.title, url: `/${r.ownerUsername}/${r.slug}` },
    })),
    ...ingredientReports.map((r) => ({
      id: r.id,
      targetKind: 'ingredient',
      targetId: r.targetId,
      reason: r.reason,
      note: r.note,
      status: r.status,
      createdAt: r.createdAt,
      target: { label: r.name, url: null },
    })),
    ...commentReports.map((r) => ({
      id: r.id,
      targetKind: 'discussion_comment',
      targetId: r.targetId,
      reason: r.reason,
      note: r.note,
      status: r.status,
      createdAt: r.createdAt,
      // Not a `#discussion` hash: the recipe page's own jump-to-discussion is a JS
      // `scrollIntoView` handler, not a real route fragment — see `recipe/index.vue`'s
      // `scrollToDiscussion()` and why the earlier `to="#discussion"` link never worked.
      target: { label: r.title, url: `/${r.ownerUsername}/${r.slug}` },
    })),
  ]

  results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return results
})
