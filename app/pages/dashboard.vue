<script setup lang="ts">
import type { DashboardRecipe } from '~~/shared/types/recipe'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t, locale } = useI18n()
const { user } = useUserSession()

useSeoMeta({
  title: `${t('nav.dashboard')}: GourMerge`,
})

// Fetch user's recipes — already sorted by `updatedAt` DESC server-side, which is what
// makes the "recently edited" strip below just a slice of this, not a second fetch.
const {
  data: recipes,
  pending,
  error,
} = useFetch<DashboardRecipe[]>('/api/recipes', {
  headers: useRequestHeaders(['cookie']),
})

/**
 * The one thing the removed dashboard sidebar had with no duplicate elsewhere — a quick
 * "pick up where you left off" list. Restored on the dashboard page itself rather than as
 * global chrome (see ROADMAP.md): the grid below is the same data, same order, but shows
 * no timestamp, so at a glance it does not actually say what is recent.
 *
 * Skipped entirely once there are 3 or fewer recipes — at that size it would repeat the
 * whole grid immediately below it, which is not a shortcut, just the same list twice.
 */
const recentlyEdited = computed(() => (recipes.value && recipes.value.length > 3 ? recipes.value.slice(0, 3) : []))

const relativeTime = computed(() => new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' }))

interface MineReport {
  id: number
  status: string
  target: { label: string; url: string | null }
}

// "Visible to the owner of the reported artefact" (ROADMAP.md) — this is that surface.
// Open only: once actioned or dismissed there is nothing left for the owner to do about it.
const { data: myReports } = useFetch<MineReport[]>('/api/reports/mine', {
  headers: useRequestHeaders(['cookie']),
  transform: (rows) => rows.filter((r) => r.status === 'open'),
})

/**
 * Clamped to never read in the future: `updatedAt` comes from the DB server's clock and
 * `Date.now()` from this one, and a small skew between the two is not something a "recently
 * edited" label should ever surface as "in 2 hours" for something just saved. Clamping
 * only the upper bound — never the magnitude of a genuinely past edit — is the one change
 * that is correct regardless of which direction a real skew turns out to run.
 */
function editedAgo(updatedAt: string): string {
  const diffMs = Math.min(0, new Date(updatedAt).getTime() - Date.now())
  const diffDays = Math.round(diffMs / 86_400_000)
  if (Math.abs(diffDays) >= 1) return relativeTime.value.format(diffDays, 'day')
  const diffHours = Math.round(diffMs / 3_600_000)
  if (Math.abs(diffHours) >= 1) return relativeTime.value.format(diffHours, 'hour')
  const diffMinutes = Math.round(diffMs / 60_000)
  return relativeTime.value.format(diffMinutes, 'minute')
}
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
          to="/recipes/new"
          data-tour="new-recipe-btn"
        />
      </template>
    </CommonPageHeader>

    <!-- ── Reports about my content ─────────────────────── -->
    <UAlert
      v-if="myReports && myReports.length > 0"
      class="mb-6"
      color="warning"
      variant="subtle"
      icon="i-lucide-flag"
      :title="t('dashboard.reportsTitle', { n: myReports.length })"
    >
      <template #description>
        <ul class="mt-1 space-y-1">
          <li v-for="report in myReports" :key="report.id">
            <NuxtLink v-if="report.target.url" :to="report.target.url" class="link">{{ report.target.label }}</NuxtLink>
            <span v-else>{{ report.target.label }}</span>
          </li>
        </ul>
      </template>
    </UAlert>

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

    <template v-else>
      <!-- ── Recently Edited ─────────────────────────────── -->
      <div v-if="recentlyEdited.length" class="mb-8">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-dimmed">
          {{ t('dashboard.recentlyEdited') }}
        </h2>
        <div class="grid gap-3 sm:grid-cols-3">
          <NuxtLink
            v-for="recipe in recentlyEdited"
            :key="recipe.id"
            :to="`/${recipe.owner.username}/${recipe.slug}`"
            class="flex items-center gap-3 rounded-lg border border-default bg-elevated p-3 transition-colors hover:border-primary"
          >
            <UIcon name="i-lucide-history" class="size-5 shrink-0 text-dimmed" aria-hidden="true" />
            <div class="min-w-0">
              <p class="truncate font-medium text-default">{{ recipe.title }}</p>
              <p class="text-xs text-dimmed">{{ editedAgo(recipe.updatedAt) }}</p>
            </div>
          </NuxtLink>
        </div>
      </div>

      <!-- ── Recipe Grid ───────────────────────────────────── -->
      <div :class="CARD_GRID">
        <RecipeCard v-for="recipe in recipes" :key="recipe.id" :recipe="recipe" />
      </div>
    </template>
  </CommonPageShell>
</template>
