<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import type { ExploreResponse } from '~~/shared/types/recipe'

// Logged-in users get the dashboard shell (with sidebar); guests get the
// public default layout (which has login/register affordances).
definePageMeta({ layout: false })

const { t } = useI18n()
const { loggedIn } = useUserSession()

const search = ref('')
// 'all' is a sentinel (empty-string values break Nuxt UI v4 USelect — ARCHITECTURE §5)
const difficulty = ref('all')
const dietaryFilter = ref('all')
const sort = ref('stars')
const selectedTag = ref('')
const page = ref(1)

const { data: allTags } = useFetch<Array<{ id: number; name: string }>>('/api/tags')

const { data, pending, refresh } = useFetch<ExploreResponse>('/api/recipes/explore', {
  query: computed(() => ({
    q: search.value || undefined,
    difficulty: difficulty.value === 'all' ? undefined : difficulty.value,
    dietaryType: dietaryFilter.value === 'all' ? undefined : dietaryFilter.value,
    tag: selectedTag.value || undefined,
    sort: sort.value,
    page: page.value,
    limit: 20,
  })),
  watch: false,
})

const debouncedRefresh = useDebounceFn(refresh, 300)

watch([difficulty, sort, dietaryFilter, selectedTag], () => {
  page.value = 1
  refresh()
})

watch(search, () => {
  page.value = 1
  debouncedRefresh()
})

function loadMore() {
  page.value++
  refresh()
}

useSeoMeta({ title: `${t('nav.explore')} — GourMerge` })
</script>

<template>
  <NuxtLayout :name="loggedIn ? 'dashboard' : 'default'">
    <CommonPageShell width="wide">
      <CommonPageHeader :title="t('nav.explore')" :subtitle="t('explore.subtitle')" icon="i-lucide-compass" />

      <!-- Filters — the one place form controls may set an explicit width,
           because they sit in a horizontal cluster (DESIGNBOOK §3.4). -->
      <div class="flex flex-wrap gap-3 mb-6">
        <UInput
          v-model="search"
          data-tour="explore-search"
          :placeholder="t('explore.search')"
          icon="i-lucide-search"
          class="w-64"
        />

        <USelect
          v-model="difficulty"
          value-key="value"
          :aria-label="t('recipe.difficultyLabel')"
          :items="[
            { label: t('explore.allDifficulties'), value: 'all' },
            { label: t('recipe.easy'), value: 'easy' },
            { label: t('recipe.medium'), value: 'medium' },
            { label: t('recipe.hard'), value: 'hard' },
          ]"
          class="w-40"
        />

        <USelect
          v-model="sort"
          value-key="value"
          :aria-label="t('explore.sortBy')"
          :items="[
            { label: t('explore.sortStars'), value: 'stars' },
            { label: t('explore.sortNewest'), value: 'newest' },
            { label: t('explore.sortForks'), value: 'forks' },
          ]"
          class="w-40"
        />

        <USelect
          v-model="dietaryFilter"
          value-key="value"
          :aria-label="t('recipe.dietaryType')"
          :items="[
            { label: t('recipe.dietaryUnspecified'), value: 'all' },
            { label: t('recipe.dietaryVegan'), value: 'vegan' },
            { label: t('recipe.dietaryVegetarian'), value: 'vegetarian' },
            { label: t('recipe.dietaryPescatarian'), value: 'pescatarian' },
            { label: t('recipe.dietaryOmnivore'), value: 'omnivore' },
          ]"
          class="w-44"
        />
      </div>

      <!-- Tag filter — a toggle row, so these are buttons per DESIGNBOOK §2, not
           pills. They used to be hand-rolled <button>s with bespoke pill styles. -->
      <div v-if="allTags?.length" class="flex flex-wrap gap-2 mb-6">
        <UButton
          v-for="tag in allTags"
          :key="tag.name"
          :label="tag.name"
          size="xs"
          :color="selectedTag === tag.name ? 'primary' : 'neutral'"
          :variant="selectedTag === tag.name ? 'solid' : 'outline'"
          :aria-pressed="selectedTag === tag.name"
          @click="
            () => {
              selectedTag = selectedTag === tag.name ? '' : tag.name
            }
          "
        />
      </div>

      <!-- Results -->
      <div v-if="pending" :class="CARD_GRID">
        <USkeleton v-for="i in 6" :key="i" class="h-48 rounded-lg" />
      </div>

      <CommonEmptyState v-else-if="!data?.recipes?.length" icon="i-lucide-search-x" :title="t('explore.noResults')" />

      <div v-else :class="CARD_GRID">
        <RecipeCard
          v-for="r in data.recipes"
          :key="r.id"
          :recipe="{ ...r, owner: { username: r.ownerUsername }, tags: r.tags, dietaryType: r.dietaryType }"
        />
      </div>

      <!-- Pagination -->
      <div v-if="data && page * 20 < data.total" class="mt-8 flex justify-center">
        <UButton :label="t('explore.loadMore')" variant="outline" color="neutral" @click="loadMore()" />
      </div>
    </CommonPageShell>
  </NuxtLayout>
</template>
