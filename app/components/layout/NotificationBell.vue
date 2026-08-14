<script setup lang="ts">
/**
 * NotificationBell — header bell with an unread-count badge and a lazily-populated
 * dropdown of the most recent unread notifications.
 *
 * Polls the lightweight `unread-count` endpoint every 60s while logged in — the full list
 * is only fetched when the dropdown is actually opened, so the poll itself stays cheap on
 * a page every signed-in visitor loads.
 */
const { t } = useI18n()
const { loggedIn } = useUserSession()

interface NotificationItem {
  id: number
  kind: string
  readAt: string | null
  createdAt: string
  actor: { username: string; displayName: string | null; avatarUrl: string | null } | null
  recipe: { title: string; slug: string; ownerUsername: string }
  targetTitle: string | null
  url: string
}

const unreadCount = ref(0)
let pollTimer: ReturnType<typeof setInterval> | undefined

async function fetchCount() {
  try {
    const res = await $fetch<{ count: number }>('/api/notifications/unread-count')
    unreadCount.value = res.count
  } catch {
    // A failed poll should not disrupt the page — the next tick tries again.
  }
}

onMounted(() => {
  if (loggedIn.value) {
    fetchCount()
    pollTimer = setInterval(fetchCount, 60_000)
  }
})
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})

const items = ref<NotificationItem[]>([])
const loadingItems = ref(false)

async function onOpenChange(open: boolean) {
  if (!open || loadingItems.value) return
  loadingItems.value = true
  try {
    const res = await $fetch<{ notifications: NotificationItem[] }>('/api/notifications', {
      query: { filter: 'unread', pageSize: 8 },
    })
    items.value = res.notifications
  } catch {
    items.value = []
  } finally {
    loadingItems.value = false
  }
}

function labelFor(item: NotificationItem): string {
  const actorName = item.actor?.displayName || item.actor?.username || ''
  switch (item.kind) {
    case 'recipe_forked':
      return t('notification.recipeForked', { actor: actorName, recipe: item.recipe.title })
    case 'gmr_opened':
      return t('notification.gmrOpened', { actor: actorName, recipe: item.recipe.title })
    case 'discussion_started':
      return t('notification.discussionStarted', { actor: actorName, recipe: item.recipe.title })
    case 'discussion_reply':
      return t('notification.discussionReply', { actor: actorName, recipe: item.recipe.title })
    case 'gmr_comment':
      return t('notification.gmrComment', { actor: actorName, recipe: item.recipe.title })
    case 'mention':
      return t('notification.mention', { actor: actorName, recipe: item.recipe.title })
    default:
      return actorName
  }
}

async function markRead(item: NotificationItem) {
  try {
    await $fetch(`/api/notifications/${item.id}/read`, { method: 'PATCH' })
    unreadCount.value = Math.max(0, unreadCount.value - 1)
  } catch {
    // Non-critical — the item still navigates even if the mark-read call failed.
  }
}
</script>

<template>
  <UDropdownMenu
    v-if="loggedIn"
    :items="[
      ...items.map((item) => ({
        label: labelFor(item),
        to: item.url,
        onSelect: () => markRead(item),
      })),
      { label: t('notification.viewAll'), to: '/notifications', icon: 'i-lucide-inbox' },
    ]"
    @update:open="onOpenChange"
  >
    <button
      type="button"
      class="relative"
      :aria-label="t('notification.bellLabel')"
      :title="t('notification.bellLabel')"
    >
      <UIcon name="i-lucide-bell" class="size-5" aria-hidden="true" />
      <UBadge
        v-if="unreadCount > 0"
        :label="unreadCount > 9 ? '9+' : String(unreadCount)"
        color="error"
        size="sm"
        class="absolute -top-1.5 -right-1.5"
      />
    </button>
  </UDropdownMenu>
</template>
