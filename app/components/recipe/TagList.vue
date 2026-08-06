<script setup lang="ts">
/**
 * TagList — static recipe tag pills. DESIGNBOOK §7.
 *
 * Usage: <RecipeTagList :tags="recipe.tags" :max="3" />
 *
 * The pill markup was hand-written in three places (recipe detail, RecipeCard,
 * and the explore filter row) with three different paddings. The interactive
 * filter variant is deliberately NOT here — a filter is a toggle button per
 * DESIGNBOOK §2, not a pill.
 */
const props = defineProps<{
  tags?: string[] | null
  /** Show at most this many, then a "+n" pill. */
  max?: number
}>()

const shown = computed(() => (props.max ? (props.tags ?? []).slice(0, props.max) : (props.tags ?? [])))
const overflow = computed(() => Math.max(0, (props.tags?.length ?? 0) - shown.value.length))

const PILL = 'rounded-full border border-default bg-elevated px-2.5 py-0.5 text-xs text-muted'
</script>

<template>
  <div v-if="tags?.length" class="flex flex-wrap gap-1.5">
    <span v-for="tag in shown" :key="tag" :class="PILL">{{ tag }}</span>
    <span v-if="overflow" :class="PILL">+{{ overflow }}</span>
  </div>
</template>
