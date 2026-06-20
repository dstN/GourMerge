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
  <div class="max-w-5xl mx-auto py-8 px-4">
    <!-- Header -->
    <div class="mb-8">
      <NuxtLink
        :to="recipeUrl"
        class="text-sm text-[var(--ui-text-muted)] hover:text-primary-500 mb-2 inline-flex items-center gap-1"
      >
        <UIcon name="i-lucide-arrow-left" class="size-4" aria-hidden="true" />
        {{ recipe?.title }}
      </NuxtLink>
      <h1 class="text-2xl font-bold flex items-center gap-2">
        <UIcon name="i-lucide-git-fork" class="size-6 text-primary-500" aria-hidden="true" />
        {{ t('forks.title') }}
        <span class="text-[var(--ui-text-dimmed)] font-normal">({{ forksData?.total ?? 0 }})</span>
      </h1>
      <p class="text-sm text-[var(--ui-text-muted)] mt-1">{{ t('forks.subtitle') }}</p>
    </div>

    <!-- Forks grid -->
    <div v-if="forks.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <RecipeCard v-for="fork in forks" :key="fork.id" :recipe="fork" />
    </div>

    <!-- Empty state -->
    <UCard v-else class="text-center py-12">
      <UIcon name="i-lucide-git-fork" class="size-12 mx-auto mb-4 text-[var(--ui-text-dimmed)]" aria-hidden="true" />
      <p class="text-lg font-semibold mb-1">{{ t('forks.empty') }}</p>
      <p class="text-[var(--ui-text-muted)]">{{ t('forks.emptyDesc') }}</p>
    </UCard>
  </div>
</template>
