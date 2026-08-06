<script setup lang="ts">
/**
 * RecipeCard — Preview card for recipe listings
 */
const { t } = useI18n()

const props = defineProps<{
  recipe: {
    id: number
    title: string
    slug: string
    description?: string | null
    difficulty: string
    dietaryType?: string | null
    tags?: string[] | null
    starCount: number
    forkCount: number
    servings: number
    prepTimeMinutes?: number | null
    cookTimeMinutes?: number | null
    visibility: string
    createdAt: string
    owner?: {
      username: string
      displayName?: string | null
      avatarUrl?: string | null
    }
  }
}>()

// Difficulty colour + its light-mode contrast fix now live in
// <RecipeDifficultyBadge> (DESIGNBOOK §7). This component used to derive both
// itself, in a second copy that had already drifted from the recipe detail page's.

const totalTime = computed(() => {
  const prep = props.recipe.prepTimeMinutes || 0
  const cook = props.recipe.cookTimeMinutes || 0
  return prep + cook || null
})
</script>

<template>
  <NuxtLink
    :to="recipe.owner ? `/${recipe.owner.username}/${recipe.slug}` : `/recipes/${recipe.id}`"
    class="block group"
  >
    <UCard class="h-full transition-all hover:border-primary-500/50 hover:shadow-lg hover:shadow-primary-500/5">
      <div class="flex flex-col h-full">
        <!-- Header -->
        <div class="flex items-start justify-between gap-2 mb-3">
          <h3 class="text-base font-semibold transition-colors group-hover:text-primary line-clamp-2">
            {{ recipe.title }}
          </h3>
          <UBadge
            v-if="recipe.visibility === 'private'"
            color="neutral"
            variant="subtle"
            icon="i-lucide-lock"
            :label="t('recipe.private')"
            class="shrink-0"
          />
        </div>

        <!-- Description -->
        <p v-if="recipe.description" class="text-sm text-muted line-clamp-2 mb-4 flex-1">
          {{ recipe.description }}
        </p>
        <div v-else class="flex-1" />

        <!-- Meta -->
        <div
          class="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-dimmed mt-auto pt-3 border-t border-default"
        >
          <RecipeDifficultyBadge :difficulty="recipe.difficulty" />

          <RecipeDietaryBadge :type="recipe.dietaryType" />

          <span v-if="totalTime" class="flex items-center gap-1">
            <UIcon name="i-lucide-clock" class="size-4" aria-hidden="true" />
            {{ totalTime }} min
          </span>

          <span class="flex items-center gap-1">
            <UIcon name="i-lucide-users" class="size-4" aria-hidden="true" />
            {{ recipe.servings }}
          </span>

          <span class="flex items-center gap-1 ml-auto">
            <UIcon name="i-lucide-star" class="size-4" aria-hidden="true" />
            {{ recipe.starCount }}
          </span>

          <span class="flex items-center gap-1">
            <UIcon name="i-lucide-git-fork" class="size-4" aria-hidden="true" />
            {{ recipe.forkCount }}
          </span>
        </div>

        <!-- Tags -->
        <RecipeTagList :tags="recipe.tags" :max="3" class="mt-2" />

        <!-- Owner (for public listings) -->
        <div v-if="recipe.owner" class="flex items-center gap-2 mt-3 text-xs text-dimmed">
          <UIcon name="i-lucide-user-circle" class="size-4" aria-hidden="true" />
          {{ recipe.owner.displayName || recipe.owner.username }}
        </div>
      </div>
    </UCard>
  </NuxtLink>
</template>
