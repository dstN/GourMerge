<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

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

const { t, locale } = useI18n()

useSeoMeta({ title: `${t('notification.viewAll')}: GourMerge` })

const filter = ref<'unread' | 'all'>('unread')
const busyId = ref<number | null>(null)
const markingAll = ref(false)

const { data, pending, error, refresh } = useFetch<{ notifications: NotificationItem[] }>('/api/notifications', {
  headers: useRequestHeaders(['cookie']),
  query: computed(() => ({ filter: filter.value, pageSize: 50 })),
})

function labelFor(item: NotificationItem): string {
  const actorName = item.actor?.displayName || item.actor?.username || ''
  const params = { actor: actorName, recipe: item.recipe.title }
  switch (item.kind) {
    case 'recipe_forked':
      return t('notification.recipeForked', params)
    case 'gmr_opened':
      return t('notification.gmrOpened', params)
    case 'discussion_started':
      return t('notification.discussionStarted', params)
    case 'discussion_reply':
      return t('notification.discussionReply', params)
    case 'gmr_comment':
      return t('notification.gmrComment', params)
    case 'mention':
      return t('notification.mention', params)
    default:
      return actorName
  }
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
  const minutes = Math.round(diffMs / 60_000)
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour')
  const days = Math.round(hours / 24)
  return rtf.format(-days, 'day')
}

async function markRead(item: NotificationItem) {
  if (item.readAt) return
  busyId.value = item.id
  try {
    await $fetch(`/api/notifications/${item.id}/read`, { method: 'PATCH' })
    await refresh()
  } finally {
    busyId.value = null
  }
}

async function markAllRead() {
  markingAll.value = true
  try {
    await $fetch('/api/notifications/read-all', { method: 'PATCH' })
    await refresh()
  } finally {
    markingAll.value = false
  }
}
</script>

<template>
  <CommonPageShell width="wide">
    <CommonPageHeader :title="t('notification.viewAll')" icon="i-lucide-inbox">
      <template #actions>
        <UButton
          v-if="filter === 'unread'"
          :label="t('notification.markAllRead')"
          icon="i-lucide-check-check"
          color="neutral"
          variant="outline"
          size="sm"
          :loading="markingAll"
          @click="markAllRead"
        />
      </template>
    </CommonPageHeader>

    <UTabs
      v-model="filter"
      :items="[
        { label: t('notification.unreadTab'), value: 'unread' },
        { label: t('notification.allTab'), value: 'all' },
      ]"
      value-key="value"
      class="mb-4 w-full"
    />

    <div v-if="pending" class="space-y-2">
      <USkeleton v-for="i in 5" :key="i" class="h-16 rounded-lg" />
    </div>

    <CommonEmptyState
      v-else-if="error"
      tone="error"
      icon="i-lucide-alert-circle"
      :title="t('dashboard.errorTitle')"
      :description="t('dashboard.errorDescription')"
    />

    <CommonEmptyState
      v-else-if="!data || data.notifications.length === 0"
      icon="i-lucide-inbox"
      :title="t('notification.empty')"
    />

    <ul v-else class="divide-y divide-default rounded-lg border border-default">
      <li v-for="item in data.notifications" :key="item.id" class="flex items-center gap-3 p-4">
        <CommonUserAvatar
          :username="item.actor?.username ?? ''"
          :display-name="item.actor?.displayName"
          :avatar-url="item.actor?.avatarUrl"
          size="sm"
        />
        <NuxtLink :to="item.url" class="flex-1 min-w-0 hover:text-primary" @click="markRead(item)">
          <p class="text-sm" :class="{ 'font-semibold': !item.readAt }">{{ labelFor(item) }}</p>
          <p class="text-xs text-dimmed">{{ formatRelative(item.createdAt) }}</p>
        </NuxtLink>
        <UButton
          v-if="!item.readAt"
          icon="i-lucide-check"
          size="xs"
          color="neutral"
          variant="ghost"
          :loading="busyId === item.id"
          :aria-label="t('notification.markRead')"
          :title="t('notification.markRead')"
          @click="markRead(item)"
        />
      </li>
    </ul>
  </CommonPageShell>
</template>
