/**
 * Weekly notification digest — one email per recipient summarizing unread notifications
 * since their last digest (or the last 7 days, on their first ever digest).
 *
 * Dispatched from `/tasks/notification-digest`, the same Plesk "Fetch a URL" cron
 * mechanism already used for `retention`/`inactive-accounts` — see `server/routes/tasks/[task].ts`.
 * Activating it in production needs a NEW Plesk scheduled task the owner has to add; see
 * `docs/RUNBOOK.md`.
 *
 * Window: since `users.last_notification_digest_at`, not a fixed 7-day lookback — recorded
 * only after a successful send, so a run that failed to mail (or was re-run by accident)
 * never marks the window as consumed. A fixed lookback would re-include the same
 * notification in two consecutive digests if the job ever ran twice in a week.
 *
 * `isMailConfigured()` → log + skip, not throw. Deliberately less strict than
 * `inactivitySweep.ts`'s throw-503 posture: a missed inactivity warning risks an unwarned
 * deletion (irreversible, must fail loudly); a missed digest risks nothing worse than the
 * weekly email arriving late next week, which is a skip-and-retry situation, not a hard stop.
 */
import { and, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm'
import { notifications, recipes, users } from '~~/server/database/schema'
import { buildNotificationDigestEmail } from './notificationDigestMessages'
import type { NotificationKind } from '~~/shared/types/notification'

export interface NotificationDigestResult {
  sent: number
  skipped: boolean
  reason?: string
  failures: number
}

export async function runNotificationDigest(opts: { dryRun?: boolean } = {}): Promise<NotificationDigestResult> {
  const dryRun = opts.dryRun === true
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  if (!dryRun && !isMailConfigured()) {
    logger.warn('notification digest skipped: SMTP is not configured')
    return { sent: 0, skipped: true, reason: 'smtp_not_configured', failures: 0 }
  }

  const appUrl = ((useRuntimeConfig().public.appUrl as string) || 'https://gourmerge.de').replace(/\/$/, '')
  const viewAllUrl = `${appUrl}/notifications`

  const rows = await db
    .select({
      notificationId: notifications.id,
      recipientId: notifications.recipientId,
      recipientEmail: users.email,
      recipientLocale: users.preferredLocale,
      kind: notifications.kind,
      actorId: notifications.actorId,
      recipeId: notifications.recipeId,
      recipeTitle: recipes.title,
      recipeVisibility: recipes.visibility,
      recipeOwnerId: recipes.ownerId,
    })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.recipientId))
    .innerJoin(recipes, eq(recipes.id, notifications.recipeId))
    .where(
      and(
        isNull(notifications.readAt),
        eq(users.isGhost, false),
        or(eq(recipes.visibility, 'public'), eq(recipes.ownerId, notifications.recipientId)),
        gte(notifications.createdAt, sql`COALESCE(${users.lastNotificationDigestAt}, NOW() - INTERVAL 7 DAY)`)
      )
    )

  if (rows.length === 0) return { sent: 0, skipped: false, failures: 0 }

  const actorIds = [...new Set(rows.map((r) => r.actorId))]
  const actorRows = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, actorIds))
  const actorMap = new Map(actorRows.map((a) => [a.id, a.displayName || a.username]))

  const byRecipient = new Map<number, typeof rows>()
  for (const row of rows) {
    const list = byRecipient.get(row.recipientId) ?? []
    list.push(row)
    byRecipient.set(row.recipientId, list)
  }

  const result: NotificationDigestResult = { sent: 0, skipped: false, failures: 0 }

  for (const [recipientId, recipientRows] of byRecipient) {
    const first = recipientRows[0]!
    const items = recipientRows.slice(0, 10).map((r) => ({
      kind: r.kind as NotificationKind,
      actorName: actorMap.get(r.actorId) ?? '',
      recipeTitle: r.recipeTitle,
    }))
    const overflow = Math.max(0, recipientRows.length - 10)
    const mail = buildNotificationDigestEmail(first.recipientLocale, items, overflow, viewAllUrl)

    if (dryRun) {
      result.sent++
      continue
    }

    try {
      await sendMail({ to: first.recipientEmail, subject: mail.subject, text: mail.text, html: mail.html })
      await db.update(users).set({ lastNotificationDigestAt: new Date() }).where(eq(users.id, recipientId))
      result.sent++
    } catch (err) {
      result.failures++
      logger.error('notification digest send failed', { userId: recipientId, err: String(err) })
    }
  }

  return result
}
