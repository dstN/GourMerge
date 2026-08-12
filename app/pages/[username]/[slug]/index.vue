<script setup lang="ts">
import type { RecipeDetail, StepTranslations } from '~~/shared/types/recipe'
import type { DropdownMenuItem } from '@nuxt/ui'

definePageMeta({ middleware: ['validate-recipe-route', 'shell'] })

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
const tour = useProductTour()
const onboarding = useOnboarding()

const username = computed(() => route.params.username as string)
const slug = computed(() => route.params.slug as string)

const {
  data: recipe,
  pending,
  error,
  refresh,
} = useFetch<RecipeDetail>(() => `/api/recipes/by-slug/${username.value}/${slug.value}`, {
  headers: useRequestHeaders(['cookie']),
  // `branch` is reactive and part of the key, so switching variant refetches and
  // re-renders server-side — the nutrition totals and structured data have to match the
  // branch on screen, which client-side swapping of the ingredient list would not give us.
  query: computed(() => ({ locale: locale.value, branch: route.query.branch })),
})

const isOwner = computed(() => recipe.value?.owner?.id === user.value?.id)
const recipeUrl = computed(() => (recipe.value ? `/${recipe.value.owner.username}/${recipe.value.slug}` : ''))

const openGmrCount = computed(() => recipe.value?.openGmrCount ?? 0)

// ── Ingredient edit (hover affordance in the ingredient list, owner only) ──
const editingIngredientId = ref<number | null>(null)

// ── Report (overflow menu — see DESIGNBOOK §2.4: not a 7th icon in the row) ──
const reportRecipeButton = useTemplateRef('reportRecipeButton')
const reportImageButton = useTemplateRef('reportImageButton')
const reportMenuItems = computed<DropdownMenuItem[]>(() => {
  const items: DropdownMenuItem[] = [
    { label: t('report.recipe'), icon: 'i-lucide-flag', onSelect: () => reportRecipeButton.value?.open() },
  ]
  if (recipe.value?.image) {
    items.push({ label: t('report.image'), icon: 'i-lucide-flag', onSelect: () => reportImageButton.value?.open() })
  }
  return items
})

// ── Ingredients → clipboard / share sheet ────────────────────
/**
 * Built from the DISPLAY values, so the list you get is the list you were reading —
 * including the viewer's metric/imperial preference. Using the canonical metric values
 * would hand an imperial reader a list in grams.
 */
const shoppingList = computed(() =>
  buildShoppingList({
    title: resolveTranslation(recipe.value?.titleTranslations, recipe.value?.title ?? ''),
    subtitle: recipe.value?.servings ? `${recipe.value.servings} ${t('recipe.servingsLabel')}` : null,
    items: (recipe.value?.currentIngredients ?? []).map((ing) => ({
      amount: `${formatQuantity(ing.displayQuantity)} ${translateUnit(ing.displayUnit)}`,
      name: ing.ingredientName,
      notes: ing.notes,
    })),
    sourceUrl: recipe.value ? `${appUrl}${recipeUrl.value}` : null,
  })
)

/**
 * The share sheet is the actual feature on a phone — it is what puts the list into Notes,
 * Reminders or a messenger. It exists only in a secure context on mobile browsers, so the
 * button is feature-detected on mount rather than guessed from the user agent, and copy is
 * always offered beside it.
 */
const canShare = ref(false)
onMounted(() => {
  canShare.value = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
})

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(copiedTimer))

async function copyIngredients() {
  const text = shoppingList.value
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    // Confirm on the button itself as well as in a toast: the toast may be missed, and
    // "did that work?" is the only question a copy action raises.
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copied.value = false), 2000)
    toast.success(t('recipe.ingredientsCopied'))
  } catch {
    // Denied permission, or an insecure context where the API is absent entirely.
    toast.error(t('recipe.copyFailed'))
  }
}

async function shareIngredients() {
  const text = shoppingList.value
  if (!text) return
  try {
    await navigator.share({ title: recipe.value?.title, text })
  } catch (e: unknown) {
    // Dismissing the share sheet raises AbortError. That is a decision, not a failure.
    if (e instanceof DOMException && e.name === 'AbortError') return
    await copyIngredients()
  }
}

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

  // Advance the tour automatically if they click the star button during the tour
  if (tour.active.value && tour.currentStep.value?.id === 'star-button') {
    tour.next()
  }

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

  // Already on the fork tour's OWN fork-button step (tour.start('fork') below already
  // navigated here, to the system recipe) — this click is the real action and must fall
  // through, not restart the tour it's already in.
  const inForkTourStep = tour.active.value && tour.currentStep.value?.id === 'fork-button'

  // First-ever "Remix" click, on ANY recipe, launches the guided fork tour instead of
  // forking THIS one — it walks the visitor through remixing the safe practice recipe
  // (the system one) rather than their first-ever fork being a real, permanent copy of
  // someone else's actual work, and shows them how to delete it again afterward.
  // markTourCompleted('fork') at the end of that tour is what stops this firing again.
  if (!inForkTourStep && !onboarding.hasCompletedTour('fork')) {
    await tour.start('fork')
    return
  }

  forkPending.value = true
  try {
    const res = await $fetch<{ id: number; slug: string; owner: { username: string } }>(
      `/api/recipes/${recipe.value.id}/fork`,
      { method: 'POST' }
    )
    toast.success(t('recipe.forkSuccess'))
    if (inForkTourStep) {
      // The tour's own route watcher takes it from here — straight to the fork's EDIT
      // page (@fork-edit), where the delete-fork anchor lives, not the view page a
      // normal fork lands on.
      tour.setForkedRecipe({ id: res.id, url: `/${res.owner.username}/${res.slug}` })
      tour.next()
    } else {
      await navigateTo(`/${res.owner.username}/${res.slug}`)
    }
  } catch (e: unknown) {
    toast.error(apiError(e, 'recipe.forkError'))
  } finally {
    forkPending.value = false
  }
}

/**
 * Jump to the discussion panel at the foot of the page.
 *
 * Deliberately imperative. `<UButton to="#discussion">` renders a `ULink`, which
 * auto-localises its target through `$localePath` — a bare hash is not a route, so the
 * router had nothing to resolve and the click did nothing at all. And even without i18n it
 * would be unreliable in this shell: `<main>` is the only scroll container (DESIGNBOOK
 * §4.1), so the browser's own hash scroll, which moves the window, has nothing to move.
 *
 * `smooth` unless the visitor has asked for less motion — the panel is a long way down, and
 * an instant jump there reads as a page change rather than as a scroll.
 */
function scrollToDiscussion() {
  const target = document.getElementById('discussion')
  if (!target) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
}

const appUrl = useRuntimeConfig().public.appUrl as string

useSeoMeta({
  title: () =>
    recipe.value ? `${resolveTranslation(recipe.value.titleTranslations, recipe.value.title)}: GourMerge` : 'GourMerge',
  description: () =>
    recipe.value
      ? resolveTranslation(recipe.value.descriptionTranslations, recipe.value.description ?? '') ||
        t('recipe.seoDescriptionFallback')
      : t('recipe.seoDescriptionFallback'),
  ogTitle: () =>
    recipe.value ? `${resolveTranslation(recipe.value.titleTranslations, recipe.value.title)}: GourMerge` : 'GourMerge',
  ogDescription: () =>
    recipe.value
      ? resolveTranslation(recipe.value.descriptionTranslations, recipe.value.description ?? '') ||
        t('recipe.seoDescriptionFallback')
      : t('recipe.seoDescriptionFallback'),
  ogUrl: () => (recipe.value ? `${appUrl}/${recipe.value.owner.username}/${recipe.value.slug}` : appUrl),
  ogType: 'website',
  ogSiteName: 'GourMerge',
  twitterCard: 'summary',
  twitterTitle: () => (recipe.value ? `${recipe.value.title}: GourMerge` : 'GourMerge'),
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
             rank, so every button is `sm` (DESIGNBOOK §2).

             Side by side only from `lg`, and the cluster is NOT `shrink-0`. Both of those
             are corrections to a measured fault, not preference. The cluster held six `sm`
             buttons at a fixed 578px and refused to shrink, while the identity line beside
             it carried `min-w-0` — so the identity was always the side that gave way. At a
             640px viewport it was squeezed to **zero width** and vanished entirely; at 768px
             the slug was fully truncated; and even at the full 832px content column it got
             238px, showing 93px of a 435px recipe name. Six buttons were legible and the
             name of the page was not.

             Stacking until `lg` gives the identity the whole line at the widths where it
             was losing, and dropping `shrink-0` lets the cluster wrap into a second row
             instead of monopolising the first. Same failure the header had at `md` — see
             `LayoutMainNav` — and the same reason it went unnoticed: nothing overflowed
             visibly, the wrong element simply lost.

             **The actions are icon-only at every width**, and that is the other half of the
             fix. Labelled, the cluster is 578px against an 832px reading column, so even at
             2560px it wrapped to two ragged lines with "Bearbeiten" orphaned underneath —
             the content column is capped at `max-w-4xl`, so a wider screen buys it nothing.
             As icons it is ~250px on one line and the recipe name gets the rest.

             This is the DESIGNBOOK §2.4 pattern: ALL of them collapse together, never one
             among labelled siblings. Each carries `aria-label` (the accessible name, since
             there is no text) and `title` (what a mouse user gets for an icon they do not
             recognise). The star keeps its number — a count is information, not a name. -->
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-3">
          <div class="flex items-center gap-x-2 text-sm text-muted min-w-0">
            <UIcon name="i-lucide-user-circle" class="size-4 shrink-0" aria-hidden="true" />
            <NuxtLink :to="`/${recipe.owner.username}`" class="shrink-0 transition-colors hover:text-default">
              {{ recipe.owner.displayName || recipe.owner.username }}
            </NuxtLink>
            <span aria-hidden="true" class="shrink-0">/</span>
            <span class="font-semibold text-default truncate">{{ recipe.slug }}</span>
          </div>

          <div class="flex items-center gap-2 flex-wrap lg:justify-end" data-tour="tour-pointers">
            <UBadge
              v-if="recipe.visibility === 'private'"
              color="neutral"
              variant="subtle"
              icon="i-lucide-lock"
              :label="t('recipe.private')"
            />
            <!-- Star toggle. The visible text is the COUNT, not a name, so the control still
                 needs both a label and a title like its icon-only neighbours — and both have
                 to say what the click will do, which depends on the current state. -->
            <UButton
              v-if="loggedIn"
              icon="i-lucide-star"
              size="sm"
              :color="starred ? 'warning' : 'neutral'"
              :variant="starred ? 'soft' : 'outline'"
              :aria-pressed="starred"
              :loading="starPending"
              :label="`${starCount}`"
              :aria-label="starred ? t('recipe.starRemove') : t('recipe.starAdd')"
              :title="starred ? t('recipe.starRemove') : t('recipe.starAdd')"
              data-tour="star-button"
              @click="toggleStar"
            />
            <UButton
              v-if="loggedIn && !isOwner"
              icon="i-lucide-git-fork"
              size="sm"
              color="neutral"
              variant="outline"
              :loading="forkPending"
              :aria-label="t('recipe.fork')"
              :title="t('recipe.fork')"
              data-tour="fork-button"
              @click="forkRecipe"
            />
            <CommonHelpHint v-if="loggedIn && !isOwner" i18n-key="glossary.fork.helpHint" size="sm" />
            <!-- Carries the number of OPEN requests, the way GitHub does: a count of
                 closed ones is history, not something needing attention. Hidden at zero
                 rather than showing a `0`, so the badge only ever means "there is
                 something here". -->
            <UButton
              icon="i-lucide-git-pull-request"
              size="sm"
              color="neutral"
              variant="outline"
              :aria-label="t('gourmergeRequest.titlePlural')"
              :title="t('gourmergeRequest.titlePlural')"
              :to="`${recipeUrl}/gourmerge-requests`"
            >
              <template v-if="openGmrCount > 0" #trailing>
                <UBadge :label="String(openGmrCount)" color="primary" variant="subtle" size="sm" />
              </template>
            </UButton>
            <!-- No "Varianten" button here: the branch picker below carries the count and
                 links to the same page, and two routes to one destination in one row is
                 noise. -->

            <!-- An in-page anchor, not a route: the discussion lives at the bottom of this
                 page, so this is a jump. The badge counts every thread rather than only the
                 open ones — unlike the GourMerge Request badge above, where "open" means
                 "needs your attention". A resolved discussion is still worth reading. -->
            <!-- A click handler, not `to="#discussion"`.
                 The link form did nothing: `<UButton to>` renders a `ULink`, which
                 auto-localises through `$localePath` — and a bare hash is not a route, so
                 the router had nothing to resolve and swallowed the navigation. Even
                 unlocalised it would be unreliable here, because only `<main>` scrolls: the
                 window-level hash scroll the browser performs has no effect on an inner
                 scroll container. `scrollIntoView` targets the right one. -->
            <UButton
              icon="i-lucide-messages-square"
              size="sm"
              color="neutral"
              variant="outline"
              :aria-label="t('discussion.title')"
              :title="t('discussion.title')"
              @click="scrollToDiscussion"
            >
              <template v-if="recipe.discussionCount > 0" #trailing>
                <UBadge :label="String(recipe.discussionCount)" color="neutral" variant="subtle" size="sm" />
              </template>
            </UButton>

            <UButton
              v-if="isOwner"
              icon="i-lucide-pencil"
              size="sm"
              variant="soft"
              :aria-label="t('common.edit')"
              :title="t('common.edit')"
              :to="`${recipeUrl}/edit`"
              data-tour="edit-recipe-btn"
            />

            <!-- Moderation goes in an overflow menu, not a 7th icon in this row —
                 DESIGNBOOK §2.4 is about not mixing icon-only with labelled siblings, but a
                 row that already collapses together is still a row a "report" button would
                 crowd for no benefit to the common case. -->
            <UDropdownMenu v-if="loggedIn" :items="reportMenuItems">
              <UButton
                icon="i-lucide-ellipsis-vertical"
                size="sm"
                color="neutral"
                variant="outline"
                :aria-label="t('report.title')"
                :title="t('report.title')"
              />
            </UDropdownMenu>
            <CommonReportButton v-if="recipe" ref="reportRecipeButton" target-kind="recipe" :target-id="recipe.id" />
            <CommonReportButton
              v-if="recipe?.image"
              ref="reportImageButton"
              target-kind="image"
              :target-id="recipe.id"
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

        <!-- Moved out of the icon-only action cluster above: six icon buttons no longer
             fit on one line at exactly the `lg` breakpoint once the report kebab joined
             them (tests/e2e/layout-alignment.spec.ts caught it), and a labelled link sits
             more naturally here anyway — commit history belongs with the branch it walks,
             the same reasoning that already keeps "Varianten" out of that row. -->
        <UButton
          :label="t('history.title')"
          icon="i-lucide-history"
          color="neutral"
          variant="ghost"
          size="sm"
          :to="`${recipeUrl}/history`"
        />
      </div>

      <!-- Ingredients -->
      <UCard class="mb-6">
        <template #header>
          <div class="flex flex-wrap items-center gap-2">
            <UIcon name="i-lucide-shopping-basket" class="size-5 text-primary" aria-hidden="true" />
            <h2 class="text-lg font-semibold">{{ t('recipe.ingredients') }}</h2>
            <UBadge color="neutral" variant="subtle" :label="String(recipe.currentIngredients.length)" />

            <!-- Take the list with you. Both `sm` per DESIGNBOOK §2.3, and both hidden when
                 there is nothing to copy rather than offered and inert. Share sits first
                 where it exists, because on a phone it is the better of the two. -->
            <div v-if="recipe.currentIngredients.length > 0" class="ml-auto flex items-center gap-2">
              <UButton
                v-if="canShare"
                :label="t('recipe.shareIngredients')"
                icon="i-lucide-share-2"
                size="sm"
                color="neutral"
                variant="outline"
                @click="shareIngredients"
              />
              <UButton
                :label="copied ? t('recipe.ingredientsCopied') : t('recipe.copyIngredients')"
                :icon="copied ? 'i-lucide-check' : 'i-lucide-clipboard-list'"
                size="sm"
                :color="copied ? 'success' : 'neutral'"
                variant="outline"
                data-test="copy-ingredients"
                @click="copyIngredients"
              />
            </div>
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
            class="group flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
          >
            <span class="flex items-center gap-1.5 font-medium">
              {{ ing.ingredientName }}
              <!-- Revealed on hover, not shown by default: this is moderation, not a
                   primary action for what is otherwise a plain read-only list. -->
              <span class="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <UButton
                  v-if="ing.canEdit"
                  icon="i-lucide-pencil"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :aria-label="t('common.edit')"
                  :title="t('common.edit')"
                  @click="editingIngredientId = ing.ingredientId"
                />
                <CommonReportButton
                  v-else-if="loggedIn"
                  v-slot="{ open }"
                  target-kind="ingredient"
                  :target-id="ing.ingredientId"
                >
                  <UButton
                    icon="i-lucide-flag"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :aria-label="t('report.title')"
                    :title="t('report.title')"
                    @click="open"
                  />
                </CommonReportButton>
              </span>
            </span>
            <span class="font-mono text-sm text-muted sm:shrink-0 sm:text-right">
              {{ formatQuantity(ing.displayQuantity) }} {{ translateUnit(ing.displayUnit) }}
              <span v-if="ing.notes" class="text-dimmed italic">({{ ing.notes }})</span>
            </span>
          </div>
        </div>
      </UCard>

      <RecipeEditIngredientModal
        v-if="editingIngredientId !== null"
        :open="editingIngredientId !== null"
        :ingredient-id="editingIngredientId"
        @update:open="
          (v) => {
            if (!v) editingIngredientId = null
          }
        "
        @saved="() => refresh()"
      />

      <!-- Serving suggestion — deliberately between the ingredients and the steps.
           That is the seam where the reader stops asking "what do I need" and starts
           asking "how do I make it", and it is the moment a picture of the finished dish
           is worth something. See RecipeCoverImage for why the dimensions travel with it. -->
      <RecipeCoverImage v-if="recipe.image" :recipe-id="recipe.id" :image="recipe.image" />

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

      <!-- Discussion — last, under the recipe. See RecipeDiscussionPanel for why under
           and not beside. -->
      <div id="discussion" class="mt-6 scroll-mt-6">
        <RecipeDiscussionPanel :recipe-id="recipe.id" :is-recipe-owner="isOwner" />
      </div>
    </div>
  </CommonPageShell>
</template>
