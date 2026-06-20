<script setup lang="ts">
import type { DashboardRecipe } from '~~/shared/types/recipe'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()

useSeoMeta({
  title: `${t('nav.starred')} — GourMerge`,
})

const {
  data: recipes,
  pending,
  error,
} = useFetch<DashboardRecipe[]>('/api/recipes/starred', {
  headers: useRequestHeaders(['cookie']),
})
</script>

<template>
  <div>
    <div class="mb-8">
      <h1 class="text-3xl font-bold mb-1 flex items-center gap-2">
        <UIcon name="i-lucide-star" class="size-7 text-primary-500" aria-hidden="true" />
        {{ t('nav.starred') }}
      </h1>
      <p class="text-[var(--ui-text-muted)]">{{ t('starred.subtitle') }}</p>
    </div>

    <div v-if="pending" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <USkeleton v-for="i in 6" :key="i" class="h-48 rounded-xl" />
    </div>

    <UCard v-else-if="error" class="text-center py-16">
      <UIcon name="i-lucide-alert-circle" class="size-16 text-red-500 mx-auto mb-4" aria-hidden="true" />
      <h2 class="text-xl font-semibold mb-2">{{ t('dashboard.errorTitle') }}</h2>
      <p class="text-[var(--ui-text-muted)] mb-6 max-w-md mx-auto">{{ t('dashboard.errorDescription') }}</p>
    </UCard>

    <UCard v-else-if="!recipes || recipes.length === 0" class="text-center py-16">
      <UIcon name="i-lucide-star" class="size-16 text-[var(--ui-text-dimmed)] mx-auto mb-4" aria-hidden="true" />
      <h2 class="text-xl font-semibold mb-2">{{ t('starred.empty') }}</h2>
      <p class="text-[var(--ui-text-muted)] mb-6 max-w-md mx-auto">{{ t('starred.emptyDesc') }}</p>
      <UButton :label="t('nav.explore')" icon="i-lucide-compass" size="lg" to="/explore" />
    </UCard>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <RecipeCard v-for="recipe in recipes" :key="recipe.id" :recipe="recipe" />
    </div>
  </div>
</template>
