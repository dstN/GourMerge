<script setup lang="ts">
definePageMeta({ middleware: ['validate-recipe-route', 'shell'] })

interface CollectionListItem {
  id: number
  title: string
  slug: string
  description: string | null
  visibility: 'public' | 'private'
  createdAt: string
}

const { t } = useI18n()
const route = useRoute()
const username = computed(() => route.params.username as string)

const {
  data,
  pending,
  error,
  refresh,
} = useFetch<{ collections: CollectionListItem[]; isOwnProfile: boolean }>(
  () => `/api/users/${username.value}/collections`,
  { headers: useRequestHeaders(['cookie']) }
)

useSeoMeta({
  title: () => `${t('collections.title')} — ${username.value}: GourMerge`,
})

const showCreate = ref(false)
const newTitle = ref('')
const creating = ref(false)
const toast = useAppToast()
const { apiError } = useApiError()

async function createCollection() {
  if (!newTitle.value.trim()) return
  creating.value = true
  try {
    await $fetch('/api/collections', { method: 'POST', body: { title: newTitle.value.trim() } })
    newTitle.value = ''
    showCreate.value = false
    await refresh()
  } catch (e) {
    toast.error(apiError(e))
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <CommonPageShell width="wide">
    <CommonPageHeader :title="t('collections.title')" :subtitle="t('collections.subtitle')" icon="i-lucide-bookmark">
      <template v-if="data?.isOwnProfile" #actions>
        <UButton
          :label="t('collections.create')"
          icon="i-lucide-plus"
          size="sm"
          @click="showCreate = !showCreate"
        />
      </template>
    </CommonPageHeader>

    <UCard v-if="showCreate" class="mb-6">
      <form class="flex flex-wrap items-end gap-3" @submit.prevent="createCollection">
        <UFormField :label="t('collections.newTitleLabel')" class="flex-1 min-w-48">
          <UInput v-model="newTitle" :placeholder="t('collections.newTitlePlaceholder')" maxlength="300" autofocus />
        </UFormField>
        <UButton type="submit" :label="t('collections.create')" :loading="creating" :disabled="!newTitle.trim()" />
      </form>
    </UCard>

    <div v-if="pending" :class="CARD_GRID">
      <USkeleton v-for="i in 3" :key="i" class="h-32 rounded-lg" />
    </div>

    <CommonEmptyState
      v-else-if="error"
      tone="error"
      icon="i-lucide-alert-circle"
      :title="t('dashboard.errorTitle')"
      :description="t('dashboard.errorDescription')"
    />

    <CommonEmptyState
      v-else-if="!data || data.collections.length === 0"
      icon="i-lucide-bookmark"
      :title="t('collections.empty')"
      :description="t('collections.emptyDesc')"
    />

    <div v-else :class="CARD_GRID">
      <CollectionCard v-for="c in data.collections" :key="c.id" :collection="c" :username="username" />
    </div>
  </CommonPageShell>
</template>
