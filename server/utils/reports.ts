/**
 * Resolve a report target: does it exist, is it visible to the reporting viewer, and who is
 * "responsible" for it — sees it via `GET /api/reports/mine`, as distinct from an admin who
 * sees everything via `GET /api/admin/reports` regardless of visibility.
 *
 * Centralised here rather than repeated in the create-report and list-mine endpoints, and
 * for the same reason `requireVisibleRecipe` exists: five different report targets each
 * re-deriving "does this exist and can this viewer see it" is five chances to get the
 * private-recipe case wrong in one of them.
 */
import { and, eq } from 'drizzle-orm'
import {
  ingredients,
  recipeDiscussionComments,
  recipeDiscussions,
  recipeImages,
  recipes,
  reports,
  users,
} from '~~/server/database/schema'

export type ReportTargetKind = 'recipe' | 'user' | 'discussion_comment' | 'image' | 'ingredient'

export interface ResolvedReportTarget {
  /**
   * Who this report is "about their stuff" for, in the sense that they can actually act on
   * it (delete the recipe, delete the comment, fix the ingredient). Empty for `user`
   * reports on purpose: the reported person is deliberately not told they were reported —
   * that is the standard shape for a behaviour report, and telling them would both invite
   * retaliation against the reporter and defeat a lot of the point of reporting at all. An
   * ingredient nobody claimed (`created_by` is `NULL` — the Swiss BLV import) has nobody
   * responsible for it either; only an admin sees those.
   */
  responsibleUserIds: number[]
}

type Db = NonNullable<ReturnType<typeof useDrizzle>>

export async function resolveReportTarget(
  db: Db,
  kind: ReportTargetKind,
  targetId: number,
  viewerId: number
): Promise<ResolvedReportTarget | null> {
  switch (kind) {
    case 'recipe': {
      const [r] = await db
        .select({ ownerId: recipes.ownerId, visibility: recipes.visibility })
        .from(recipes)
        .where(eq(recipes.id, targetId))
        .limit(1)
      if (!r) return null
      if (r.visibility === 'private' && r.ownerId !== viewerId) return null
      return { responsibleUserIds: [r.ownerId] }
    }

    case 'user': {
      const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).limit(1)
      if (!u) return null
      return { responsibleUserIds: [] }
    }

    case 'discussion_comment': {
      const [row] = await db
        .select({
          authorId: recipeDiscussionComments.authorId,
          recipeOwnerId: recipes.ownerId,
          visibility: recipes.visibility,
        })
        .from(recipeDiscussionComments)
        .innerJoin(recipeDiscussions, eq(recipeDiscussionComments.discussionId, recipeDiscussions.id))
        .innerJoin(recipes, eq(recipeDiscussions.recipeId, recipes.id))
        .where(eq(recipeDiscussionComments.id, targetId))
        .limit(1)
      if (!row) return null
      if (row.visibility === 'private' && row.recipeOwnerId !== viewerId) return null
      // Both the person who wrote it and the recipe owner can delete it (same rule as
      // DELETE .../comments/:commentId), so both count as responsible.
      return { responsibleUserIds: [row.authorId, row.recipeOwnerId] }
    }

    case 'image': {
      // Addressed by the owning recipe's id, matching /api/recipes/:id/image — recipe_images
      // has no id ever exposed to a client to report against instead.
      const [r] = await db
        .select({ ownerId: recipes.ownerId, visibility: recipes.visibility })
        .from(recipes)
        .where(eq(recipes.id, targetId))
        .limit(1)
      if (!r) return null
      if (r.visibility === 'private' && r.ownerId !== viewerId) return null
      const [img] = await db
        .select({ id: recipeImages.id })
        .from(recipeImages)
        .where(eq(recipeImages.recipeId, targetId))
        .limit(1)
      if (!img) return null
      return { responsibleUserIds: [r.ownerId] }
    }

    case 'ingredient': {
      const [ing] = await db
        .select({ createdBy: ingredients.createdBy })
        .from(ingredients)
        .where(eq(ingredients.id, targetId))
        .limit(1)
      if (!ing) return null
      return { responsibleUserIds: ing.createdBy != null ? [ing.createdBy] : [] }
    }
  }
}

/**
 * Closes every open report against a target once that target is gone — deleting the
 * recipe, comment, thread or image IS the moderation response the ROADMAP describes
 * ("the shipped moderation tools... are the response"), so a report left `open` against
 * something that no longer exists would just be a queue entry with nothing left to do.
 *
 * Best-effort by design: called from delete handlers after the delete has already
 * succeeded, so a failure here must never surface as a failure of the delete itself.
 */
export async function closeReportsForTarget(db: Db, kind: ReportTargetKind, targetId: number): Promise<void> {
  await db
    .update(reports)
    .set({ status: 'actioned' })
    .where(and(eq(reports.targetKind, kind), eq(reports.targetId, targetId), eq(reports.status, 'open')))
}
