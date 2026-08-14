<script setup lang="ts">
/**
 * CollectionCard — preview card for a collections listing, styled to match RecipeCard.
 */
const { t } = useI18n()

defineProps<{
  username: string
  collection: {
    id: number
    title: string
    slug: string
    description?: string | null
    visibility: 'public' | 'private'
  }
}>()
</script>

<template>
  <NuxtLink :to="`/${username}/collections/${collection.slug}`" class="block group">
    <UCard class="h-full transition-all hover:border-primary-500/50 hover:shadow-lg hover:shadow-primary-500/5">
      <div class="flex items-start justify-between gap-2 mb-2">
        <h3 class="text-base font-semibold transition-colors group-hover:text-primary line-clamp-2">
          {{ collection.title }}
        </h3>
        <UBadge
          v-if="collection.visibility === 'private'"
          color="neutral"
          variant="subtle"
          icon="i-lucide-lock"
          :label="t('recipe.private')"
          class="shrink-0"
        />
      </div>
      <p v-if="collection.description" class="text-sm text-muted line-clamp-2">{{ collection.description }}</p>
    </UCard>
  </NuxtLink>
</template>
