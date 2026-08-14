/**
 * Notifications — the kind list and item shape shared by the API, the mute-preference
 * form, and the inbox/bell UI. One list here rather than a copy in `schema.ts`'s enum, the
 * settings form, and the mark-read endpoints' validation, so a 7th kind is a one-line add.
 */

export const NOTIFICATION_KINDS = [
  'recipe_forked',
  'gmr_opened',
  'discussion_started',
  'discussion_reply',
  'gmr_comment',
  'mention',
] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

export type NotificationTargetKind = 'recipe' | 'discussion' | 'gmr'

export interface NotificationActor {
  username: string
  displayName: string | null
  avatarUrl: string | null
}

export interface NotificationItem {
  id: number
  kind: NotificationKind
  readAt: string | null
  createdAt: string
  actor: NotificationActor | null
  recipe: { title: string; slug: string; ownerUsername: string }
  targetTitle: string | null
  url: string
}
