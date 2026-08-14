<script setup lang="ts">
defineProps<{
  activity: {
    recipesPublished: number
    commitsMade: number
    gmrsOpened: number
    gmrsMerged: number
  }
}>()

const { t } = useI18n()
</script>

<template>
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
    <UCard
      v-for="tile in [
        { icon: 'i-lucide-book-open', value: activity.recipesPublished, label: t('profile.statRecipesPublished') },
        { icon: 'i-lucide-git-commit-horizontal', value: activity.commitsMade, label: t('profile.statCommitsMade') },
        { icon: 'i-lucide-git-pull-request', value: activity.gmrsOpened, label: t('profile.statGmrsOpened') },
        { icon: 'i-lucide-git-merge', value: activity.gmrsMerged, label: t('profile.statGmrsMerged') },
      ]"
      :key="tile.label"
    >
      <div class="flex items-center gap-3">
        <UIcon :name="tile.icon" class="size-5 text-primary shrink-0" aria-hidden="true" />
        <div>
          <p class="text-xl font-bold leading-tight">{{ tile.value }}</p>
          <p class="text-xs text-dimmed">{{ tile.label }}</p>
        </div>
      </div>
    </UCard>
  </div>
</template>
