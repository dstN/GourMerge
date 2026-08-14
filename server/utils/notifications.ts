/**
 * Notification creation — the one choke point every mutating endpoint calls through,
 * so "never notify yourself" and "respect a mute" are each enforced exactly once.
 *
 * Every call here must run inside the SAME transaction as the event that causes it (a
 * fork, a GMR, a discussion post/reply) — a comment that saved but silently dropped its
 * notification would be a worse outcome than the comment failing outright.
 */
import { inArray, and, ne } from 'drizzle-orm'
import { notifications, users } from '~~/server/database/schema'
import type { NotificationKind, NotificationTargetKind } from '~~/shared/types/notification'

type Db = NonNullable<ReturnType<typeof useDrizzle>>

/**
 * Insert one notification row, or do nothing.
 *
 * No-ops on self-notification (a merge you perform on your own recipe, a reply to your
 * own thread) and on a muted kind. `recipientMutes` is caller-supplied rather than
 * fetched here: every call site already loads the recipient row for its own ownership
 * check, so extending that existing SELECT to also pull `notification_mutes` avoids a
 * second round trip per notification.
 */
export async function createNotification(
  db: Db,
  params: {
    recipientId: number
    actorId: number
    kind: NotificationKind
    recipeId: number
    targetKind: NotificationTargetKind
    targetId: number
    recipientMutes?: string[] | null
  }
): Promise<void> {
  if (params.recipientId === params.actorId) return
  if (params.recipientMutes?.includes(params.kind)) return

  await db.insert(notifications).values({
    recipientId: params.recipientId,
    actorId: params.actorId,
    kind: params.kind,
    recipeId: params.recipeId,
    targetKind: params.targetKind,
    targetId: params.targetId,
  })
}

/**
 * Extract distinct `@username` tokens from a comment/discussion body.
 *
 * The `(?:^|[^\w@])` lookbehind-substitute excludes a match where the `@` is preceded by
 * a word character or another `@` — that is what stops `user@example.com` from reading as
 * a mention of `example` (the character before that `@` is `r`, a word character), without
 * needing a real email detector. Charset matches `register.post.ts`'s own username
 * validation. Capped at 20 distinct usernames per comment — silently drops anything past
 * the cap, not a validation error; does not touch the body's own length limit.
 */
export function extractMentions(body: string): string[] {
  const seen = new Map<string, string>() // lowercase -> original casing
  const pattern = /(?:^|[^\w@])@([a-zA-Z0-9_-]{1,50})/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(body)) !== null) {
    const raw = match[1]!
    const key = raw.toLowerCase()
    if (!seen.has(key)) seen.set(key, raw)
    if (seen.size >= 20) break
  }
  return [...seen.values()]
}

/**
 * Resolve `@username` mentions in a comment/discussion body and notify each valid,
 * visible, non-muted recipient. Must run inside the same transaction as the body's own
 * insert.
 *
 * The private-recipe rule is the actual risk `mentions` introduces (see ROADMAP.md):
 * `requireVisibleRecipe` only proves the COMMENTER can see the recipe, not an arbitrary
 * mentioned user. If the recipe is private, a mention notification is created ONLY when
 * the mentioned user is the recipe's owner — every other mention inside a private
 * recipe's discussion is silently dropped, never partially notified.
 */
export async function notifyMentions(
  db: Db,
  params: {
    body: string
    authorId: number
    recipeId: number
    recipeOwnerId: number
    recipeVisibility: 'public' | 'private'
    targetKind: NotificationTargetKind
    targetId: number
  }
): Promise<void> {
  const usernames = extractMentions(params.body)
  if (usernames.length === 0) return

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      isGhost: users.isGhost,
      notificationMutes: users.notificationMutes,
    })
    .from(users)
    .where(and(inArray(users.username, usernames), ne(users.id, params.authorId)))

  for (const row of rows) {
    if (row.isGhost) continue
    if (params.recipeVisibility === 'private' && row.id !== params.recipeOwnerId) continue

    await createNotification(db, {
      recipientId: row.id,
      actorId: params.authorId,
      kind: 'mention',
      recipeId: params.recipeId,
      targetKind: params.targetKind,
      targetId: params.targetId,
      recipientMutes: row.notificationMutes,
    })
  }
}

/**
 * Read-time visibility filter, shared by the inbox list, the unread-count, and the
 * digest: a private recipe's notifications are only ever visible to its owner. Applied as
 * a WHERE fragment against an already-joined `recipes` table so it lives in exactly one
 * place — see the callers for the join shape.
 */
export function notificationRecipeVisible(
  recipeVisibility: 'public' | 'private',
  recipeOwnerId: number,
  recipientId: number
) {
  return recipeVisibility === 'public' || recipeOwnerId === recipientId
}
