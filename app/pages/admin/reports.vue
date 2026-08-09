<script setup lang="ts">
/**
 * /admin/reports — the moderation queue. No link to it anywhere in the nav: `isAdmin` is
 * not something most visitors need to know exists, and `requireAdmin` on the server is the
 * real gate regardless — this page is convenience, not the boundary.
 */
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

interface AdminReport {
  id: number
  targetKind: string
  targetId: number
  reporterUsername: string | null
  reason: string
  note: string | null
  status: string
  createdAt: string
  target: { label: string; url: string | null }
}

const { t } = useI18n()
const toast = useAppToast()
const { apiError } = useApiError()

const status = ref<'open' | 'actioned' | 'dismissed'>('open')
const busyId = ref<number | null>(null)

const {
  data: reports,
  pending,
  error,
  refresh,
} = useFetch<AdminReport[]>('/api/admin/reports', {
  headers: useRequestHeaders(['cookie']),
  query: computed(() => ({ status: status.value })),
})

const KIND_ICON: Record<string, string> = {
  recipe: 'i-lucide-book-open',
  user: 'i-lucide-user',
  discussion_comment: 'i-lucide-message-square',
  image: 'i-lucide-image',
  ingredient: 'i-lucide-carrot',
}

async function act(report: AdminReport, next: 'actioned' | 'dismissed') {
  busyId.value = report.id
  try {
    await $fetch(`/api/admin/reports/${report.id}`, { method: 'PATCH', body: { status: next } })
    toast.success(t('admin.reports.updated'))
    await refresh()
  } catch (e: unknown) {
    toast.error(apiError(e, 'common.error'))
  } finally {
    busyId.value = null
  }
}

useSeoMeta({ title: `${t('admin.reports.title')}: GourMerge` })
</script>

<template>
  <CommonPageShell width="wide">
    <CommonPageHeader :title="t('admin.reports.title')" icon="i-lucide-shield" />

    <UTabs
      v-model="status"
      :items="[
        { label: t('admin.reports.statusOpen'), value: 'open' },
        { label: t('admin.reports.statusActioned'), value: 'actioned' },
        { label: t('admin.reports.statusDismissed'), value: 'dismissed' },
      ]"
      value-key="value"
      class="mb-4 w-full"
    />

    <div v-if="pending" class="space-y-3">
      <USkeleton v-for="i in 4" :key="i" class="h-20 w-full rounded-lg" />
    </div>

    <CommonEmptyState
      v-else-if="error"
      tone="error"
      icon="i-lucide-shield-alert"
      :title="t('admin.reports.forbiddenTitle')"
      :description="t('admin.reports.forbiddenDescription')"
    />

    <CommonEmptyState
      v-else-if="!reports || reports.length === 0"
      icon="i-lucide-inbox"
      :title="t('admin.reports.emptyTitle')"
    />

    <ul v-else class="space-y-3">
      <li v-for="report in reports" :key="report.id" class="rounded-lg border border-default p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <UIcon
                :name="KIND_ICON[report.targetKind] ?? 'i-lucide-flag'"
                class="size-4 text-dimmed"
                aria-hidden="true"
              />
              <NuxtLink v-if="report.target.url" :to="report.target.url" class="link truncate font-medium">
                {{ report.target.label }}
              </NuxtLink>
              <span v-else class="truncate font-medium">{{ report.target.label }}</span>
              <UBadge color="neutral" variant="subtle" :label="t(`report.reason.${report.reason}`)" />
            </div>
            <p class="mt-1 text-xs text-dimmed">
              {{ t('admin.reports.reportedBy', { username: report.reporterUsername ?? '—' }) }}
            </p>
            <p v-if="report.note" class="mt-2 text-sm text-muted">{{ report.note }}</p>
          </div>
          <div v-if="status === 'open'" class="flex shrink-0 gap-2">
            <UButton
              :label="t('admin.reports.dismiss')"
              color="neutral"
              variant="outline"
              size="sm"
              :loading="busyId === report.id"
              @click="act(report, 'dismissed')"
            />
            <UButton
              :label="t('admin.reports.markActioned')"
              color="primary"
              variant="soft"
              size="sm"
              :loading="busyId === report.id"
              @click="act(report, 'actioned')"
            />
          </div>
        </div>
      </li>
    </ul>
  </CommonPageShell>
</template>
