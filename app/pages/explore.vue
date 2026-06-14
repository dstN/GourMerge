<script setup lang="ts">
const { t } = useI18n()

const search = ref('')
const difficulty = ref('')
const sort = ref('stars')
const page = ref(1)

const { data, pending, refresh } = useFetch('/api/recipes/explore', {
  query: computed(() => ({
    q: search.value || undefined,
    difficulty: difficulty.value || undefined,
    sort: sort.value,
    page: page.value,
    limit: 20,
  })),
  watch: false,
})

const debouncedRefresh = useDebounceFn(refresh, 300)

watch([difficulty, sort], () => {
  page.value = 1
  refresh()
})

watch(search, () => {
  page.value = 1
  debouncedRefresh()
})

useSeoMeta({ title: `${t('nav.explore')} — GourMerge` })
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">{{ t('nav.explore') }}</h1>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap gap-3 mb-6">
      <UInput
        v-model="search"
        :placeholder="t('explore.search')"
        icon="i-lucide-search"
        class="w-64"
      />

      <USelect
        v-model="difficulty"
        :options="[
          { label: t('explore.allDifficulties'), value: '' },
          { label: t('recipe.easy'), value: 'easy' },
          { label: t('recipe.medium'), value: 'medium' },
          { label: t('recipe.hard'), value: 'hard' },
        ]"
        class="w-40"
      />

      <USelect
        v-model="sort"
        :options="[
          { label: t('explore.sortStars'), value: 'stars' },
          { label: t('explore.sortNewest'), value: 'newest' },
          { label: t('explore.sortForks'), value: 'forks' },
        ]"
        class="w-40"
      />
    </div>

    <!-- Results -->
    <div v-if="pending" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <USkeleton v-for="i in 6" :key="i" class="h-40 rounded-xl" />
    </div>

    <div v-else-if="!data?.recipes?.length" class="text-center py-16 text-[var(--ui-text-muted)]">
      <UIcon name="i-lucide-search-x" class="size-12 mx-auto mb-4 opacity-40" />
      <p>{{ t('explore.noResults') }}</p>
    </div>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <RecipeCard
        v-for="r in data.recipes"
        :key="r.id"
        :recipe="{ ...r, owner: { username: r.ownerUsername } }"
      />
    </div>

    <!-- Pagination -->
    <div v-if="data?.recipes?.length === 20" class="mt-8 flex justify-center">
      <UButton
        :label="t('explore.loadMore')"
        variant="outline"
        color="neutral"
        @click="page++; refresh()"
      />
    </div>
  </div>
</template>
