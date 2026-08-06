<script setup lang="ts">
/**
 * Recipe Forks Page — lists recipes forked from this one.
 *
 * URL: /:username/:slug/forks  (public, mirrors the recipe detail page)
 */
import type { RecipeDetail } from '~~/shared/types/recipe'

definePageMeta({ middleware: ['validate-recipe-route'] })

interface ForkCard {
  id: number
  title: string
  slug: string
  description: string | null
  difficulty: string
  dietaryType?: string | null
  servings: number
  prepTimeMinutes: number | null
  cookTimeMinutes: number | null
  visibility: string
  starCount: number
  forkCount: number
  createdAt: string
  owner: { username: string; displayName: string | null; avatarUrl: string | null }
}

const { t } = useI18n()
const route = useRoute()

const username = computed(() => route.params.username as string)
const slug = computed(() => route.params.slug as string)
const recipeUrl = computed(() => `/${username.value}/${slug.value}`)

const { data: recipe } = await useFetch<RecipeDetail>(() => `/api/recipes/by-slug/${username.value}/${slug.value}`, {
  headers: useRequestHeaders(['cookie']),
})

if (!recipe.value) {
  throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
}

const { data: forksData } = await useFetch<{ forks: ForkCard[]; total: number }>(
  () => `/api/recipes/${recipe.value!.id}/forks`,
  { headers: useRequestHeaders(['cookie']) }
)

const forks = computed(() => forksData.value?.forks ?? [])

useSeoMeta({
  title: () => (recipe.value ? `${t('forks.title')} — ${recipe.value.title} · GourMerge` : 'GourMerge'),
})
</script>

<template>
  <CommonPageShell width="wide">
    <CommonPageHeader
      :title="t('forks.title')"
      :subtitle="t('forks.subtitle')"
      icon="i-lucide-git-fork"
      :back-to="recipeUrl"
      :back-label="recipe?.title"
    >
      <template #title-suffix>
        <span class="font-normal text-dimmed">({{ forksData?.total ?? 0 }})</span>
      </template>
    </CommonPageHeader>

    <!-- Forks grid -->
    <div v-if="forks.length" :class="CARD_GRID">
      <RecipeCard v-for="fork in forks" :key="fork.id" :recipe="fork" />
    </div>

    <CommonEmptyState v-else icon="i-lucide-git-fork" :title="t('forks.empty')" :description="t('forks.emptyDesc')" />
  </CommonPageShell>
</template>
