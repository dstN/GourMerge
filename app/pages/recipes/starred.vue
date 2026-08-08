<script setup lang="ts">
import type { DashboardRecipe } from '~~/shared/types/recipe'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()

useSeoMeta({
  title: `${t('nav.starred')}: GourMerge`,
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
  <CommonPageShell width="wide">
    <CommonPageHeader :title="t('nav.starred')" :subtitle="t('starred.subtitle')" icon="i-lucide-star" />

    <div v-if="pending" :class="CARD_GRID">
      <USkeleton v-for="i in 6" :key="i" class="h-48 rounded-lg" />
    </div>

    <CommonEmptyState
      v-else-if="error"
      tone="error"
      icon="i-lucide-alert-circle"
      :title="t('dashboard.errorTitle')"
      :description="t('dashboard.errorDescription')"
    />

    <CommonEmptyState
      v-else-if="!recipes || recipes.length === 0"
      icon="i-lucide-star"
      :title="t('starred.empty')"
      :description="t('starred.emptyDesc')"
    >
      <template #actions>
        <UButton :label="t('nav.explore')" icon="i-lucide-compass" to="/explore" />
      </template>
    </CommonEmptyState>

    <div v-else :class="CARD_GRID">
      <RecipeCard v-for="recipe in recipes" :key="recipe.id" :recipe="recipe" />
    </div>
  </CommonPageShell>
</template>
