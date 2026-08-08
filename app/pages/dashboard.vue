<script setup lang="ts">
/**
 * Dashboard Page — Authenticated user's home
 *
 * Shows the user's recipes in a grid and quick actions.
 */
import type { DashboardRecipe } from '~~/shared/types/recipe'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()
const { user } = useUserSession()
const tour = useProductTour()

useSeoMeta({
  title: `${t('nav.dashboard')} — GourMerge`,
})

// Fetch user's recipes
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
    <CommonPageHeader
      :title="t('dashboard.welcome', { name: user?.displayName || user?.username })"
      :subtitle="t('dashboard.subtitle')"
    >
      <template #actions>
        <UButton
          :label="t('nav.newRecipe')"
          icon="i-lucide-plus"
          size="lg"
          :to="tour.active.value ? '/recipes/new?tour=1' : '/recipes/new'"
          data-tour="new-recipe-btn"
        />
      </template>
    </CommonPageHeader>

    <!-- ── Loading State ─────────────────────────────────── -->
    <div v-if="pending" :class="CARD_GRID">
      <USkeleton v-for="i in 6" :key="i" class="h-48 rounded-lg" />
    </div>

    <!-- ── Error State ───────────────────────────────────── -->
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

    <!-- ── Empty State ───────────────────────────────────── -->
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

    <!-- ── Recipe Grid ───────────────────────────────────── -->
    <div v-else :class="CARD_GRID">
      <RecipeCard v-for="recipe in recipes" :key="recipe.id" :recipe="recipe" />
    </div>
  </CommonPageShell>
</template>
