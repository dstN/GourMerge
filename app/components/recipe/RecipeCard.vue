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

const difficultyColor = computed(() => {
  switch (props.recipe.difficulty) {
    case 'easy':
      return 'success'
    case 'medium':
      return 'warning'
    case 'hard':
      return 'error'
    default:
      return 'neutral'
  }
})

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
    <UCard class="h-full hover:border-primary-500/50 transition-all hover:shadow-lg hover:shadow-primary-500/5">
      <div class="flex flex-col h-full">
        <!-- Header -->
        <div class="flex items-start justify-between mb-3">
          <h3 class="text-lg font-semibold group-hover:text-primary-500 transition-colors line-clamp-2">
            {{ recipe.title }}
          </h3>
          <UBadge
            v-if="recipe.visibility === 'private'"
            color="neutral"
            variant="subtle"
            icon="i-lucide-lock"
            :label="t('recipe.private')"
            size="xs"
          />
        </div>

        <!-- Description -->
        <p v-if="recipe.description" class="text-sm text-[var(--ui-text-muted)] line-clamp-2 mb-4 flex-1">
          {{ recipe.description }}
        </p>
        <div v-else class="flex-1" />

        <!-- Meta -->
        <div
          class="flex items-center gap-3 text-xs text-[var(--ui-text-dimmed)] mt-auto pt-3 border-t border-[var(--ui-border)]"
        >
          <UBadge :color="difficultyColor" variant="subtle" :label="t(`recipe.${recipe.difficulty}`)" size="xs" />

          <RecipeDietaryBadge :type="recipe.dietaryType" />

          <span v-if="totalTime" class="flex items-center gap-1">
            <UIcon name="i-lucide-clock" class="size-3.5" />
            {{ totalTime }} min
          </span>

          <span class="flex items-center gap-1">
            <UIcon name="i-lucide-users" class="size-3.5" />
            {{ recipe.servings }}
          </span>

          <span class="flex items-center gap-1 ml-auto">
            <UIcon name="i-lucide-star" class="size-3.5" />
            {{ recipe.starCount }}
          </span>

          <span class="flex items-center gap-1">
            <UIcon name="i-lucide-git-fork" class="size-3.5" />
            {{ recipe.forkCount }}
          </span>
        </div>

        <!-- Tags -->
        <div v-if="recipe.tags?.length" class="flex flex-wrap gap-1 mt-2">
          <span
            v-for="tag in recipe.tags.slice(0, 3)"
            :key="tag"
            class="text-xs px-2 py-0.5 rounded-full bg-[var(--ui-bg-elevated)] text-[var(--ui-text-muted)] border border-[var(--ui-border)]"
            >{{ tag }}</span
          >
          <span
            v-if="recipe.tags.length > 3"
            class="text-xs px-2 py-0.5 rounded-full bg-[var(--ui-bg-elevated)] text-[var(--ui-text-dimmed)]"
            >+{{ recipe.tags.length - 3 }}</span
          >
        </div>

        <!-- Owner (for public listings) -->
        <div v-if="recipe.owner" class="flex items-center gap-2 mt-3 text-xs text-[var(--ui-text-dimmed)]">
          <UIcon name="i-lucide-user-circle" class="size-4" />
          {{ recipe.owner.displayName || recipe.owner.username }}
        </div>
      </div>
    </UCard>
  </NuxtLink>
</template>
