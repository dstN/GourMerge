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

useSeoMeta({
  title: `${t('nav.dashboard')} — GourMerge`,
})

// Fetch user's recipes
const { data: recipes, pending, error } = useFetch<DashboardRecipe[]>('/api/recipes', {
  headers: useRequestHeaders(['cookie']),
})
</script>

<template>
  <div>
    <!-- ── Welcome Header ────────────────────────────────── -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
      <div>
        <h1 class="text-3xl font-bold mb-1">
          {{ t('dashboard.welcome', { name: user?.displayName || user?.username }) }}
        </h1>
        <p class="text-[var(--ui-text-muted)]">
          {{ t('dashboard.subtitle') }}
        </p>
      </div>
      <UButton
        :label="t('nav.newRecipe')"
        icon="i-lucide-plus"
        size="lg"
        to="/recipes/new"
        class="mt-4 sm:mt-0"
      />
    </div>

    <!-- ── Loading State ─────────────────────────────────── -->
    <div v-if="pending" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <USkeleton v-for="i in 6" :key="i" class="h-48 rounded-xl" />
    </div>

    <!-- ── Error State ───────────────────────────────────── -->
    <UCard v-else-if="error" class="text-center py-16">
      <UIcon name="i-lucide-alert-circle" class="size-16 text-red-500 mx-auto mb-4" />
      <h2 class="text-xl font-semibold mb-2">
        {{ t('dashboard.errorTitle') }}
      </h2>
      <p class="text-[var(--ui-text-muted)] mb-6 max-w-md mx-auto">
        {{ t('dashboard.errorDescription') }}
      </p>
      <UButton
        :label="t('auth.loginButton')"
        icon="i-lucide-log-in"
        to="/auth/login"
      />
    </UCard>

    <!-- ── Empty State ───────────────────────────────────── -->
    <UCard v-else-if="!recipes || recipes.length === 0" class="text-center py-16">
      <UIcon name="i-lucide-book-open" class="size-16 text-[var(--ui-text-dimmed)] mx-auto mb-4" />
      <h2 class="text-xl font-semibold mb-2">
        {{ t('dashboard.emptyTitle') }}
      </h2>
      <p class="text-[var(--ui-text-muted)] mb-6 max-w-md mx-auto">
        {{ t('dashboard.emptyDescription') }}
      </p>
      <UButton
        :label="t('dashboard.createFirst')"
        icon="i-lucide-plus"
        size="lg"
        to="/recipes/new"
      />
    </UCard>

    <!-- ── Recipe Grid ───────────────────────────────────── -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <RecipeRecipeCard
        v-for="recipe in recipes"
        :key="recipe.id"
        :recipe="recipe"
      />
    </div>
  </div>
</template>
