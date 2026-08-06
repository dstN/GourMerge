<script setup lang="ts">
/**
 * DifficultyBadge — recipe difficulty, one definition. DESIGNBOOK §7.
 *
 * Usage: <RecipeDifficultyBadge :difficulty="recipe.difficulty" />
 *
 * Colour comes from `DIFFICULTY_COLOR` and the light-mode-readable label class
 * from `TINT_CLASS` (both in `app/utils/ui.ts`), so the fix for the pale-tint
 * contrast problem lives in one file rather than being re-derived in RecipeCard
 * and on the recipe detail page — where the two copies had already drifted.
 */
const { t } = useI18n()

const props = defineProps<{ difficulty: string }>()

const color = computed(() => DIFFICULTY_COLOR[props.difficulty] ?? 'neutral')
const tint = computed(() => TINT_CLASS[color.value] ?? '')
</script>

<template>
  <!--
    `variant="subtle"` is NOT optional here. The `.tint-*` class darkens the label
    for contrast against the **pale** tint that `subtle` paints. Nuxt UI's own badge
    default is `solid`, so omitting the variant renders amber-700 text on a
    saturated amber fill — illegible. That shipped for one commit, after the global
    `badge.defaultVariants` had to be removed (DESIGNBOOK §2.1) and this component
    silently inherited `solid` instead.
  -->
  <UBadge :color="color" variant="subtle" :class="tint" :label="t(`recipe.${difficulty}`)" />
</template>
