<script setup lang="ts">
import type { RecipeDetail, StepTranslations } from '~~/shared/types/recipe'

definePageMeta({ middleware: ['validate-recipe-route'] })

function resolveStepContent(step: { content: string; contentTranslations: StepTranslations | null }): string {
  const loc = locale.value as keyof StepTranslations
  const translated = step.contentTranslations?.[loc]
  const effective = translated && translated.trim() !== '' ? translated : step.content
  // Output is sanitized (allowlist) before v-html — see app/utils/markdown.ts
  return renderMarkdownSafe(effective)
}

function resolveTranslation(translations: StepTranslations | null | undefined, fallback: string): string {
  const loc = locale.value as keyof StepTranslations
  const translated = translations?.[loc]
  return translated && translated.trim() !== '' ? translated : fallback
}

const { t, locale } = useI18n()
const { apiError } = useApiError()

/**
 * Unit labels. Covers the canonical set AND the display-only units the API can
 * return once the viewer's measurement preference is applied (`kg`/`l` for scaled
 * metric, `oz`/`lb`/`cup`/`floz` for imperial) — see the by-slug endpoint.
 */
const UNIT_I18N: Record<string, string> = {
  g: 'recipe.unitG',
  ml: 'recipe.unitMl',
  piece: 'recipe.unitPiece',
  pinch: 'recipe.unitPinch',
  tsp: 'recipe.unitTsp',
  tbsp: 'recipe.unitTbsp',
  kg: 'recipe.unitKg',
  l: 'recipe.unitL',
  oz: 'recipe.unitOz',
  lb: 'recipe.unitLb',
  cup: 'recipe.unitCup',
  floz: 'recipe.unitFloz',
}
function translateUnit(unit: string): string {
  const key = UNIT_I18N[unit]
  return key ? t(key) : unit
}

/** Locale-aware number formatting: "1.2 kg" in EN, "1,2 kg" in DE. */
function formatQuantity(value: string): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 2 }).format(n)
}
const route = useRoute()
const { user, loggedIn } = useUserSession()
const toast = useAppToast()

const username = computed(() => route.params.username as string)
const slug = computed(() => route.params.slug as string)

const {
  data: recipe,
  pending,
  error,
} = useFetch<RecipeDetail>(() => `/api/recipes/by-slug/${username.value}/${slug.value}`, {
  headers: useRequestHeaders(['cookie']),
  // `branch` is reactive and part of the key, so switching variant refetches and
  // re-renders server-side — the nutrition totals and structured data have to match the
  // branch on screen, which client-side swapping of the ingredient list would not give us.
  query: computed(() => ({ locale: locale.value, branch: route.query.branch })),
})

const isOwner = computed(() => recipe.value?.owner?.id === user.value?.id)
const recipeUrl = computed(() => (recipe.value ? `/${recipe.value.owner.username}/${recipe.value.slug}` : ''))

// ── Branch switching ─────────────────────────────────────────
const branchItems = computed(() =>
  (recipe.value?.branches ?? []).map((b) => ({ label: b.name, value: b.id, isDefault: b.isDefault }))
)

/**
 * Switching variant is a navigation, not local state: the branch lives in the URL so the
 * view is shareable and bookmarkable, and the server recomputes the snapshot, the nutrition
 * totals and the structured data for it. Swapping only the ingredient list client-side
 * would leave those three describing a different branch than the page shows.
 *
 * The default branch drops the parameter entirely rather than pinning `?branch=<id>`, so
 * the canonical URL of a recipe stays clean and does not depend on an internal id.
 */
function goToBranch(branchId: number) {
  const target = recipe.value?.branches.find((b) => b.id === branchId)
  if (!target) return
  navigateTo(target.isDefault ? recipeUrl.value : `${recipeUrl.value}?branch=${target.id}`)
}

// ── Star toggle ──────────────────────────────────────────────
const starred = ref(false)
const starCount = ref(0)
const starPending = ref(false)

watch(
  recipe,
  (r) => {
    if (r) {
      starred.value = r.isStarred ?? false
      starCount.value = r.starCount ?? 0
    }
  },
  { immediate: true }
)

async function toggleStar() {
  if (!loggedIn.value || !recipe.value) return
  starPending.value = true
  try {
    const res = await $fetch<{ starred: boolean }>(`/api/recipes/${recipe.value.id}/star`, { method: 'POST' })
    starred.value = res.starred
    starCount.value += res.starred ? 1 : -1
  } catch {
    toast.error(t('common.error'))
  } finally {
    starPending.value = false
  }
}

// ── Fork ─────────────────────────────────────────────────────
const forkPending = ref(false)

async function forkRecipe() {
  if (!loggedIn.value || !recipe.value) return
  forkPending.value = true
  try {
    const res = await $fetch<{ slug: string; owner: { username: string } }>(`/api/recipes/${recipe.value.id}/fork`, {
      method: 'POST',
    })
    toast.success(t('recipe.forkSuccess'))
    await navigateTo(`/${res.owner.username}/${res.slug}`)
  } catch (e: unknown) {
    toast.error(apiError(e, 'recipe.forkError'))
  } finally {
    forkPending.value = false
  }
}

const appUrl = useRuntimeConfig().public.appUrl as string

useSeoMeta({
  title: () =>
    recipe.value
      ? `${resolveTranslation(recipe.value.titleTranslations, recipe.value.title)} — GourMerge`
      : 'GourMerge',
  description: () =>
    recipe.value
      ? resolveTranslation(recipe.value.descriptionTranslations, recipe.value.description ?? '') ||
        t('recipe.seoDescriptionFallback')
      : t('recipe.seoDescriptionFallback'),
  ogTitle: () =>
    recipe.value
      ? `${resolveTranslation(recipe.value.titleTranslations, recipe.value.title)} — GourMerge`
      : 'GourMerge',
  ogDescription: () =>
    recipe.value
      ? resolveTranslation(recipe.value.descriptionTranslations, recipe.value.description ?? '') ||
        t('recipe.seoDescriptionFallback')
      : t('recipe.seoDescriptionFallback'),
  ogUrl: () => (recipe.value ? `${appUrl}/${recipe.value.owner.username}/${recipe.value.slug}` : appUrl),
  ogType: 'website',
  ogSiteName: 'GourMerge',
  twitterCard: 'summary',
  twitterTitle: () => (recipe.value ? `${recipe.value.title} — GourMerge` : 'GourMerge'),
  twitterDescription: () => recipe.value?.description || t('recipe.seoDescriptionFallback'),
  robots: () => (recipe.value?.visibility === 'private' ? 'noindex,nofollow' : 'index,follow'),
})

// Recipe schema.org JSON-LD structured data
useHead(() => {
  if (!recipe.value) return {}
  const r = recipe.value
  // Display form, so the structured data matches what the page actually shows.
  // For anonymous crawlers (which is what gets indexed) display === canonical.
  const ingredients = (r.currentIngredients || []).map(
    (ing) => `${ing.displayQuantity} ${ing.displayUnit} ${ing.ingredientName}${ing.notes ? ` (${ing.notes})` : ''}`
  )
  const steps = (r.currentSteps || []).map((s, i) => ({
    '@type': 'HowToStep',
    position: i + 1,
    text: s.content,
  }))
  return {
    script: [
      {
        type: 'application/ld+json',
        innerHTML: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Recipe',
          name: r.title,
          description: r.description || undefined,
          author: {
            '@type': 'Person',
            name: r.owner?.displayName || r.owner?.username,
            url: `${appUrl}/${r.owner?.username}`,
          },
          url: `${appUrl}/${r.owner?.username}/${r.slug}`,
          datePublished: r.createdAt,
          recipeYield: r.servings ? `${r.servings} ${t('recipe.servingsLabel')}` : undefined,
          prepTime: r.prepTimeMinutes ? `PT${r.prepTimeMinutes}M` : undefined,
          cookTime: r.cookTimeMinutes ? `PT${r.cookTimeMinutes}M` : undefined,
          recipeDifficulty: r.difficulty,
          recipeIngredient: ingredients.length ? ingredients : undefined,
          recipeInstructions: steps.length ? steps : undefined,
        }),
      },
    ],
  }
})
</script>

<template>
  <CommonPageShell width="content">
    <!-- Loading -->
    <div v-if="pending" class="space-y-4">
      <USkeleton class="h-8 w-2/3" />
      <USkeleton class="h-4 w-1/3" />
      <USkeleton class="h-64 w-full rounded-lg" />
    </div>

    <!-- Error -->
    <CommonEmptyState
      v-else-if="error"
      tone="error"
      icon="i-lucide-alert-triangle"
      :title="t('common.error')"
      :description="error.statusMessage || t('recipe.notFound')"
    />

    <!-- Recipe content -->
    <div v-else-if="recipe">
      <!-- Header -->
      <div class="mb-6">
        <!-- Top row: owner path + action cluster. Every action here is the same
             rank, so every button is `sm` (DESIGNBOOK §2). -->
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-3">
          <div class="flex items-center gap-x-2 text-sm text-muted min-w-0">
            <UIcon name="i-lucide-user-circle" class="size-4 shrink-0" aria-hidden="true" />
            <NuxtLink :to="`/${recipe.owner.username}`" class="shrink-0 transition-colors hover:text-default">
              {{ recipe.owner.displayName || recipe.owner.username }}
            </NuxtLink>
            <span aria-hidden="true" class="shrink-0">/</span>
            <span class="font-semibold text-default truncate">{{ recipe.slug }}</span>
          </div>

          <div class="flex items-center gap-2 shrink-0 flex-wrap">
            <UBadge
              v-if="recipe.visibility === 'private'"
              color="neutral"
              variant="subtle"
              icon="i-lucide-lock"
              :label="t('recipe.private')"
            />
            <!-- Star toggle -->
            <UButton
              v-if="loggedIn"
              icon="i-lucide-star"
              size="sm"
              :color="starred ? 'warning' : 'neutral'"
              :variant="starred ? 'soft' : 'outline'"
              :aria-pressed="starred"
              :loading="starPending"
              :label="`${starCount}`"
              data-tour="star-button"
              @click="toggleStar"
            />
            <UButton
              v-if="loggedIn && !isOwner"
              icon="i-lucide-git-fork"
              :label="t('recipe.fork')"
              size="sm"
              color="neutral"
              variant="outline"
              :loading="forkPending"
              data-tour="fork-button"
              @click="forkRecipe"
            />
            <CommonHelpHint v-if="loggedIn && !isOwner" i18n-key="glossary.fork.helpHint" size="sm" />
            <UButton
              :label="t('gourmergeRequest.titlePlural')"
              icon="i-lucide-git-pull-request"
              size="sm"
              color="neutral"
              variant="outline"
              :to="`${recipeUrl}/gourmerge-requests`"
              data-tour="gourmerge-requests-link"
            />
            <UButton
              :label="t('branches.title')"
              icon="i-lucide-git-branch"
              size="sm"
              color="neutral"
              variant="outline"
              :to="`${recipeUrl}/branches`"
            />
            <UButton
              :label="t('history.title')"
              icon="i-lucide-history"
              size="sm"
              color="neutral"
              variant="outline"
              :to="`${recipeUrl}/history`"
              data-tour="history-link"
            />
            <UButton
              v-if="isOwner"
              :label="t('common.edit')"
              icon="i-lucide-pencil"
              size="sm"
              variant="soft"
              :to="`${recipeUrl}/edit`"
            />
          </div>
        </div>

        <!-- Title block (full width) -->
        <h1 class="text-2xl font-bold tracking-tight sm:text-3xl mb-2">
          {{ resolveTranslation(recipe.titleTranslations, recipe.title) }}
        </h1>
        <p v-if="recipe.forkedFrom" class="text-sm text-muted mb-2">
          <UIcon name="i-lucide-git-fork" class="size-4 inline-block align-text-bottom mr-1" aria-hidden="true" />{{
            t('recipe.forkedFrom')
          }}:
          <NuxtLink
            :to="`/${recipe.forkedFrom.username}/${recipe.forkedFrom.slug}`"
            class="link font-medium break-words"
            >{{ recipe.forkedFrom.displayName || recipe.forkedFrom.username }}/{{ recipe.forkedFrom.slug }}</NuxtLink
          >
        </p>
        <p v-if="recipe.description" class="text-muted text-lg">
          {{ resolveTranslation(recipe.descriptionTranslations, recipe.description) }}
        </p>
      </div>

      <!-- Meta badges -->
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <UBadge
          color="neutral"
          variant="outline"
          icon="i-lucide-users"
          :label="`${recipe.servings} ${t('recipe.servingsLabel')}`"
        />
        <UBadge
          v-if="recipe.prepTimeMinutes"
          color="neutral"
          variant="outline"
          icon="i-lucide-clock"
          :label="`${recipe.prepTimeMinutes} min ${t('recipe.prepTime')}`"
        />
        <UBadge
          v-if="recipe.cookTimeMinutes"
          color="neutral"
          variant="outline"
          icon="i-lucide-flame"
          :label="`${recipe.cookTimeMinutes} min ${t('recipe.cookTime')}`"
        />
        <RecipeDifficultyBadge :difficulty="recipe.difficulty" />
        <RecipeDietaryBadge v-if="recipe.dietaryType" :type="recipe.dietaryType" />
        <div class="ml-auto flex items-center gap-3 text-sm text-dimmed">
          <span class="flex items-center gap-1">
            <UIcon name="i-lucide-star" class="size-4" aria-hidden="true" /> {{ starCount }}
          </span>
          <NuxtLink
            :to="`${recipeUrl}/forks`"
            class="flex items-center gap-1 transition-colors hover:text-default"
            :title="t('recipe.viewForks')"
          >
            <UIcon name="i-lucide-git-fork" class="size-4" aria-hidden="true" /> {{ recipe.forkCount }}
          </NuxtLink>
        </div>
      </div>

      <!-- Tags row -->
      <RecipeTagList :tags="recipe.tags" class="mb-6" />

      <!-- Branch selector — a toolbar row, not a card.
           The card version printed the branch name in its heading AND again in the picker
           trigger, then left an empty body with a divider under it. The picker already
           states which variant is shown, so the heading was duplication and the card was
           a box around one control. This is GitHub's arrangement: picker, then the count
           as a link to the full page. Both `sm`, per DESIGNBOOK §2.3.

           Until this existed the detail page ignored `?branch=` entirely and always
           rendered the default, so a variant could be created and edited but never read. -->
      <div v-if="recipe.selectedBranch" class="mb-6 flex flex-wrap items-center gap-2">
        <USelectMenu
          :model-value="recipe.selectedBranch.id"
          :items="branchItems"
          value-key="value"
          icon="i-lucide-git-branch"
          size="sm"
          :search-input="recipe.branches.length > 4 ? { placeholder: t('branches.filter') } : false"
          :aria-label="t('branches.switchTo')"
          class="sm:w-64"
          @update:model-value="goToBranch"
        >
          <template #item-trailing="{ item }">
            <UBadge
              v-if="item.isDefault"
              :label="t('recipe.defaultBranch')"
              color="neutral"
              variant="subtle"
              size="sm"
            />
          </template>
        </USelectMenu>

        <UBadge
          v-if="recipe.selectedBranch.isDefault"
          color="primary"
          variant="subtle"
          :label="t('recipe.defaultBranch')"
        />

        <UButton
          :label="t('branches.count', { n: recipe.branches.length })"
          icon="i-lucide-git-branch"
          color="neutral"
          variant="ghost"
          size="sm"
          :to="`${recipeUrl}/branches`"
        />
      </div>

      <!-- Ingredients -->
      <UCard class="mb-6">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-shopping-basket" class="size-5 text-primary" aria-hidden="true" />
            <h2 class="text-lg font-semibold">{{ t('recipe.ingredients') }}</h2>
            <UBadge color="neutral" variant="subtle" :label="String(recipe.currentIngredients.length)" />
          </div>
        </template>

        <div v-if="recipe.currentIngredients.length === 0" class="text-center py-8 text-muted">
          {{ t('recipe.noIngredients') }}
        </div>

        <!--
          Stacked below `sm`, two columns above it. `justify-between` on one line put the
          name and the measurement in a tug-of-war: a long note ("oder jede andere Hot
          Sauce") wrapped onto two lines and collided with the ingredient name beside it.
          Amount under name reads cleanly at any width and never truncates either.
        -->
        <div v-else class="divide-y divide-default">
          <div
            v-for="ing in recipe.currentIngredients"
            :key="ing.id"
            class="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
          >
            <span class="font-medium">{{ ing.ingredientName }}</span>
            <span class="font-mono text-sm text-muted sm:shrink-0 sm:text-right">
              {{ formatQuantity(ing.displayQuantity) }} {{ translateUnit(ing.displayUnit) }}
              <span v-if="ing.notes" class="text-dimmed italic">({{ ing.notes }})</span>
            </span>
          </div>
        </div>
      </UCard>

      <!-- Nutrition bar (compact) -->
      <RecipeNutritionFacts
        v-if="recipe.nutritionTotal && recipe.nutritionPerServing && recipe.nutritionTotal.coveredCount > 0"
        :total="recipe.nutritionTotal"
        :per-serving="recipe.nutritionPerServing"
        :servings="recipe.servings ?? 4"
        :compact="true"
      />

      <!-- Steps -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-list-ordered" class="size-5 text-primary" aria-hidden="true" />
            <h2 class="text-lg font-semibold">{{ t('recipe.steps') }}</h2>
            <UBadge color="neutral" variant="subtle" :label="String(recipe.currentSteps.length)" />
          </div>
        </template>

        <div v-if="recipe.currentSteps.length === 0" class="text-center py-8 text-muted">
          {{ t('recipe.noSteps') }}
        </div>

        <div v-else class="space-y-6">
          <div v-for="step in recipe.currentSteps" :key="step.id" class="flex gap-4">
            <div
              class="shrink-0 size-8 rounded-full bg-primary-500/10 text-primary flex items-center justify-center font-bold text-sm"
            >
              {{ step.sortOrder }}
            </div>
            <!-- eslint-disable-next-line vue/no-v-html -- content is sanitized via renderMarkdownSafe() -->
            <div class="flex-1 prose prose-sm dark:prose-invert max-w-none pt-1" v-html="resolveStepContent(step)" />
          </div>
        </div>
      </UCard>
    </div>
  </CommonPageShell>
</template>
