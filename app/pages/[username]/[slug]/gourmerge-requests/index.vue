<script setup lang="ts">
import type { RecipeDetail, GourmergeRequestListItem } from '~~/shared/types/recipe'

definePageMeta({ middleware: ['validate-recipe-route'] })

const { t } = useI18n()
const route = useRoute()
const { loggedIn } = useUserSession()

const username = computed(() => route.params.username as string)
const slug = computed(() => route.params.slug as string)
const recipeUrl = computed(() => `/${username.value}/${slug.value}`)

const { data: recipe } = useFetch<RecipeDetail>(
  () => `/api/recipes/by-slug/${username.value}/${slug.value}`,
  { headers: useRequestHeaders(['cookie']) },
)

const statusFilter = ref('open')

const recipeId = computed(() => recipe.value?.id ?? 0)

const { data: requests, pending } = useFetch<GourmergeRequestListItem[]>(
  () => `/api/recipes/${recipeId.value}/gourmerge-requests`,
  {
    headers: useRequestHeaders(['cookie']),
    query: computed(() => ({ status: statusFilter.value })),
    watch: [statusFilter, recipeId],
  },
)

const statusColors: Record<string, 'success' | 'neutral' | 'primary' | 'warning'> = {
  open: 'success',
  closed: 'neutral',
  merged: 'primary',
  draft: 'warning',
}

useSeoMeta({
  title: () => recipe.value ? `${t('gourmergeRequest.titlePlural')} — ${recipe.value.title}` : 'GourMerge',
})
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8">
    <!-- Breadcrumb -->
    <div class="flex items-center gap-2 text-sm text-[var(--ui-text-muted)] mb-4">
      <NuxtLink :to="recipeUrl" class="hover:text-primary-500 transition-colors">
        {{ recipe?.title }}
      </NuxtLink>
      <UIcon name="i-lucide-chevron-right" class="size-4" />
      <span>{{ t('gourmergeRequest.titlePlural') }}</span>
    </div>

    <div class="flex items-center justify-between mb-6">
      <h1 class="text-xl font-bold flex items-center gap-2">
        <UIcon name="i-lucide-git-pull-request" class="size-5 text-primary-500" />
        {{ t('gourmergeRequest.titlePlural') }}
      </h1>
      <UButton
        v-if="loggedIn && recipe"
        :label="t('gourmergeRequest.new')"
        icon="i-lucide-plus"
        :to="`${recipeUrl}/gourmerge-requests/new`"
      />
    </div>

    <!-- Status tabs -->
    <div class="flex gap-2 mb-4">
      <UButton
        v-for="s in ['open', 'closed', 'merged']"
        :key="s"
        :label="t(`gourmergeRequest.${s}`)"
        :variant="statusFilter === s ? 'solid' : 'outline'"
        :color="statusColors[s]"
        size="sm"
        @click="statusFilter = s"
      />
    </div>

    <div v-if="pending" class="space-y-3">
      <USkeleton v-for="i in 3" :key="i" class="h-16 rounded-xl" />
    </div>

    <div v-else-if="!requests?.length" class="text-center py-16 text-[var(--ui-text-muted)]">
      <UIcon name="i-lucide-git-pull-request" class="size-12 mx-auto mb-4 opacity-40" />
      <p>{{ t('gourmergeRequest.noRequests') }}</p>
    </div>

    <div v-else class="space-y-3">
      <UCard
        v-for="r in requests"
        :key="r.id"
        class="hover:border-primary-300 dark:hover:border-primary-700 transition-colors cursor-pointer"
        :to="`${recipeUrl}/gourmerge-requests/${r.id}`"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <UBadge :color="statusColors[r.status]" variant="subtle" :label="t(`gourmergeRequest.${r.status}`)" size="xs" />
              <span class="font-semibold truncate">{{ r.title }}</span>
            </div>
            <p class="text-sm text-[var(--ui-text-muted)]">
              {{ t('gourmergeRequest.by', { author: r.authorDisplayName || r.authorUsername }) }}
            </p>
          </div>
          <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-[var(--ui-text-muted)]" />
        </div>
      </UCard>
    </div>
  </div>
</template>
