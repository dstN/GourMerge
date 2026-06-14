<script setup lang="ts">
definePageMeta({ middleware: ['validate-recipe-route'] })

const { t } = useI18n()
const route = useRoute()
const { user, loggedIn } = useUserSession()
const toast = useAppToast()

const username = computed(() => route.params.username as string)
const slug = computed(() => route.params.slug as string)

const { data: recipe, pending, error } = useFetch(
  () => `/api/recipes/by-slug/${username.value}/${slug.value}`,
  { headers: useRequestHeaders(['cookie']) },
)

const isOwner = computed(() => recipe.value?.owner?.id === user.value?.id)
const recipeUrl = computed(() => recipe.value ? `/${recipe.value.owner.username}/${recipe.value.slug}` : '')

// ── Star toggle ──────────────────────────────────────────────
const starred = ref(false)
const starCount = ref(0)
const starPending = ref(false)

watch(recipe, (r) => {
  if (r) {
    starred.value = r.isStarred ?? false
    starCount.value = r.starCount ?? 0
  }
}, { immediate: true })

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
    const res = await $fetch<{ slug: string; owner: { username: string } }>(
      `/api/recipes/${recipe.value.id}/fork`,
      { method: 'POST' },
    )
    toast.success(t('recipe.forkSuccess'))
    await navigateTo(`/${res.owner.username}/${res.slug}`)
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || t('recipe.forkError'))
  } finally {
    forkPending.value = false
  }
}

const appUrl = useRuntimeConfig().public.appUrl as string

useSeoMeta({
  title: () => recipe.value ? `${recipe.value.title} — GourMerge` : 'GourMerge',
  description: () => recipe.value?.description || t('recipe.seoDescriptionFallback'),
  ogTitle: () => recipe.value ? `${recipe.value.title} — GourMerge` : 'GourMerge',
  ogDescription: () => recipe.value?.description || t('recipe.seoDescriptionFallback'),
  ogUrl: () => recipe.value ? `${appUrl}/${recipe.value.owner.username}/${recipe.value.slug}` : appUrl,
  ogType: 'website',
  ogSiteName: 'GourMerge',
  twitterCard: 'summary',
  twitterTitle: () => recipe.value ? `${recipe.value.title} — GourMerge` : 'GourMerge',
  twitterDescription: () => recipe.value?.description || t('recipe.seoDescriptionFallback'),
  robots: () => recipe.value?.visibility === 'private' ? 'noindex,nofollow' : 'index,follow',
})

// Recipe schema.org JSON-LD structured data
useHead(() => {
  if (!recipe.value) return {}
  const r = recipe.value
  const ingredients = (r.currentIngredients || []).map(
    (ing: any) => `${ing.quantity} ${ing.unit} ${ing.ingredientName}${ing.notes ? ` (${ing.notes})` : ''}`,
  )
  const steps = (r.currentSteps || []).map((s: any, i: number) => ({
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
  <div class="max-w-4xl mx-auto px-4 py-8">
    <!-- Loading -->
    <div v-if="pending" class="space-y-4">
      <USkeleton class="h-8 w-2/3" />
      <USkeleton class="h-4 w-1/3" />
      <USkeleton class="h-64 w-full rounded-xl" />
    </div>

    <!-- Error -->
    <UCard v-else-if="error" class="text-center py-16">
      <UIcon name="i-lucide-alert-triangle" class="size-16 text-error-500 mx-auto mb-4" />
      <h2 class="text-xl font-semibold">{{ t('common.error') }}</h2>
      <p class="text-[var(--ui-text-muted)]">{{ error.statusMessage || t('recipe.notFound') }}</p>
    </UCard>

    <!-- Recipe content -->
    <div v-else-if="recipe">
      <!-- Header -->
      <div class="flex items-start justify-between mb-6">
        <div>
          <div class="flex items-center gap-2 text-sm text-[var(--ui-text-muted)] mb-1">
            <UIcon name="i-lucide-user-circle" class="size-4" />
            <NuxtLink :to="`/${recipe.owner.username}`" class="hover:text-primary-500 transition-colors">
              {{ recipe.owner.displayName || recipe.owner.username }}
            </NuxtLink>
            <span>/</span>
            <span class="font-semibold text-[var(--ui-text)]">{{ recipe.slug }}</span>
          </div>
          <h1 class="text-3xl font-bold mb-2">{{ recipe.title }}</h1>
          <p v-if="recipe.description" class="text-[var(--ui-text-muted)] text-lg">
            {{ recipe.description }}
          </p>
        </div>

        <div class="flex items-center gap-2 shrink-0 flex-wrap">
          <UBadge
            v-if="recipe.visibility === 'private'"
            color="neutral"
            variant="subtle"
            icon="i-lucide-lock"
            :label="t('recipe.private')"
          />
          <!-- Star button (logged-in, not owner) -->
          <UButton
            v-if="loggedIn"
            :icon="starred ? 'i-lucide-star' : 'i-lucide-star'"
            :color="starred ? 'warning' : 'neutral'"
            :variant="starred ? 'soft' : 'outline'"
            size="sm"
            :loading="starPending"
            :label="`${starCount}`"
            data-tour="star-button"
            @click="toggleStar"
          />
          <!-- Fork button (logged-in, not owner) -->
          <UButton
            v-if="loggedIn && !isOwner"
            icon="i-lucide-git-fork"
            :label="t('recipe.fork')"
            variant="outline"
            color="neutral"
            size="sm"
            :loading="forkPending"
            data-tour="fork-button"
            @click="forkRecipe"
          />
          <UButton
            :label="t('gourmergeRequest.titlePlural')"
            icon="i-lucide-git-pull-request"
            variant="outline"
            color="neutral"
            size="sm"
            :to="`${recipeUrl}/gourmerge-requests`"
          />
          <UButton
            :label="t('branches.title')"
            icon="i-lucide-git-branch"
            variant="outline"
            color="neutral"
            size="sm"
            :to="`${recipeUrl}/branches`"
          />
          <UButton
            :label="t('history.title')"
            icon="i-lucide-history"
            variant="outline"
            color="neutral"
            size="sm"
            :to="`${recipeUrl}/history`"
          />
          <UButton
            v-if="isOwner"
            :label="t('common.edit')"
            icon="i-lucide-pencil"
            variant="soft"
            :to="`${recipeUrl}/edit`"
          />
        </div>
      </div>

      <!-- Meta badges -->
      <div class="flex flex-wrap items-center gap-3 mb-8">
        <UBadge color="neutral" variant="outline" icon="i-lucide-users" :label="`${recipe.servings} ${t('recipe.servingsLabel')}`" />
        <UBadge v-if="recipe.prepTimeMinutes" color="neutral" variant="outline" icon="i-lucide-clock" :label="`${recipe.prepTimeMinutes} min ${t('recipe.prepTime')}`" />
        <UBadge v-if="recipe.cookTimeMinutes" color="neutral" variant="outline" icon="i-lucide-flame" :label="`${recipe.cookTimeMinutes} min ${t('recipe.cookTime')}`" />
        <UBadge :color="recipe.difficulty === 'easy' ? 'success' : recipe.difficulty === 'hard' ? 'error' : 'warning'" variant="subtle" :label="t(`recipe.${recipe.difficulty}`)" />
        <div class="ml-auto flex items-center gap-3 text-sm text-[var(--ui-text-dimmed)]">
          <span class="flex items-center gap-1">
            <UIcon name="i-lucide-star" class="size-4" /> {{ starCount }}
          </span>
          <span class="flex items-center gap-1">
            <UIcon name="i-lucide-git-fork" class="size-4" /> {{ recipe.forkCount }}
          </span>
        </div>
      </div>

      <!-- Branch info -->
      <UCard v-if="recipe.defaultBranch" class="mb-6">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-git-branch" class="size-5 text-primary-500" />
            <span class="font-semibold">{{ recipe.defaultBranch.name }}</span>
            <UBadge color="primary" variant="subtle" :label="t('recipe.defaultBranch')" size="xs" />
          </div>
        </template>
      </UCard>

      <!-- Ingredients -->
      <UCard class="mb-6">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-shopping-basket" class="size-5 text-primary-500" />
            <h2 class="text-lg font-semibold">{{ t('recipe.ingredients') }}</h2>
            <UBadge color="neutral" variant="subtle" :label="String(recipe.currentIngredients.length)" size="xs" />
          </div>
        </template>

        <div v-if="recipe.currentIngredients.length === 0" class="text-center py-8 text-[var(--ui-text-muted)]">
          {{ t('recipe.noIngredients') }}
        </div>

        <div v-else class="divide-y divide-[var(--ui-border)]">
          <div
            v-for="ing in recipe.currentIngredients"
            :key="ing.id"
            class="flex items-center justify-between py-3"
          >
            <span class="font-medium">{{ ing.ingredientName }}</span>
            <span class="font-mono text-sm text-[var(--ui-text-muted)]">
              {{ ing.quantity }} {{ ing.unit }}
              <span v-if="ing.notes" class="text-[var(--ui-text-dimmed)] italic ml-2">
                ({{ ing.notes }})
              </span>
            </span>
          </div>
        </div>
      </UCard>

      <!-- Steps -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-list-ordered" class="size-5 text-primary-500" />
            <h2 class="text-lg font-semibold">{{ t('recipe.steps') }}</h2>
            <UBadge color="neutral" variant="subtle" :label="String(recipe.currentSteps.length)" size="xs" />
          </div>
        </template>

        <div v-if="recipe.currentSteps.length === 0" class="text-center py-8 text-[var(--ui-text-muted)]">
          {{ t('recipe.noSteps') }}
        </div>

        <div v-else class="space-y-6">
          <div
            v-for="step in recipe.currentSteps"
            :key="step.id"
            class="flex gap-4"
          >
            <div class="shrink-0 w-8 h-8 rounded-full bg-primary-500/10 text-primary-500 flex items-center justify-center font-bold text-sm">
              {{ step.sortOrder }}
            </div>
            <div class="flex-1 prose prose-sm dark:prose-invert max-w-none pt-1" v-html="step.content" />
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
