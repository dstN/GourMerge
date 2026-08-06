<script setup lang="ts">
import type { DashboardRecipe } from '~~/shared/types/recipe'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()

useSeoMeta({
  title: `${t('nav.myRecipes')} — GourMerge`,
})

const {
  data: recipes,
  pending,
  error,
} = useFetch<DashboardRecipe[]>('/api/recipes', {
  headers: useRequestHeaders(['cookie']),
})
</script>

<template>
  <CommonPageShell width="wide">
    <CommonPageHeader :title="t('nav.myRecipes')" :subtitle="t('dashboard.subtitle')" icon="i-lucide-book-open">
      <template #actions>
        <UButton :label="t('nav.newRecipe')" icon="i-lucide-plus" size="lg" to="/recipes/new" />
      </template>
    </CommonPageHeader>

    <div v-if="pending" :class="CARD_GRID">
      <USkeleton v-for="i in 6" :key="i" class="h-48 rounded-lg" />
    </div>

    <CommonEmptyState
      v-else-if="error"
      tone="error"
      icon="i-lucide-alert-circle"
      :title="t('dashboard.errorTitle')"
      :description="t('dashboard.errorDescription')"
    >
      <template #actions>
        <UButton :label="t('auth.loginButton')" icon="i-lucide-log-in" to="/auth/login" />
      </template>
    </CommonEmptyState>

    <CommonEmptyState
      v-else-if="!recipes || recipes.length === 0"
      icon="i-lucide-book-open"
      :title="t('dashboard.emptyTitle')"
      :description="t('dashboard.emptyDescription')"
    >
      <template #actions>
        <UButton :label="t('dashboard.createFirst')" icon="i-lucide-plus" to="/recipes/new" />
      </template>
    </CommonEmptyState>

    <div v-else :class="CARD_GRID">
      <RecipeCard v-for="recipe in recipes" :key="recipe.id" :recipe="recipe" />
    </div>
  </CommonPageShell>
</template>
