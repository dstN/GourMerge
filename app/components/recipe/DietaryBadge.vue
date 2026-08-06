<script setup lang="ts">
const { t } = useI18n()
const props = defineProps<{ type?: string | null }>()

// The light/dark contrast pair for each tint lives in the `.tint-*` classes in
// `main.css` (DESIGNBOOK §1.6), so this component names a tint rather than
// re-deriving `text-*-700 dark:text-*-400` per case — which is what it used to do,
// in the fourth copy of that pattern in the codebase.
const config = computed(() => {
  switch (props.type) {
    case 'vegan':
      return { icon: 'i-lucide-leaf', tint: 'tint-success', bg: 'bg-success-500/10', label: t('recipe.dietaryVegan') }
    case 'vegetarian':
      return {
        icon: 'i-lucide-sprout',
        tint: 'tint-herb',
        bg: 'bg-tint-herb',
        label: t('recipe.dietaryVegetarian'),
      }
    case 'pescatarian':
      return {
        icon: 'i-lucide-fish',
        tint: 'tint-info',
        bg: 'bg-info-500/10',
        label: t('recipe.dietaryPescatarian'),
      }
    case 'omnivore':
      return {
        icon: 'i-lucide-beef',
        tint: 'tint-warning',
        bg: 'bg-warning-500/10',
        label: t('recipe.dietaryOmnivore'),
      }
    default:
      return null
  }
})
</script>

<template>
  <span
    v-if="config"
    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
    :class="[config.tint, config.bg]"
  >
    <UIcon :name="config.icon" class="size-4 shrink-0" aria-hidden="true" />
    {{ config.label }}
  </span>
</template>
