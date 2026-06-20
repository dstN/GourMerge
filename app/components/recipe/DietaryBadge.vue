<script setup lang="ts">
const { t } = useI18n()
const props = defineProps<{ type?: string | null }>()

// Light-mode text uses the -700 shade for WCAG AA contrast on the /10 tint;
// dark mode keeps the lighter -400 shade (already high-contrast on dark bg).
const config = computed(() => {
  switch (props.type) {
    case 'vegan':
      return {
        icon: 'i-lucide-leaf',
        color: 'text-green-700 dark:text-green-400',
        bg: 'bg-green-500/10',
        label: t('recipe.dietaryVegan'),
      }
    case 'vegetarian':
      return {
        icon: 'i-lucide-sprout',
        color: 'text-lime-700 dark:text-lime-400',
        bg: 'bg-lime-500/10',
        label: t('recipe.dietaryVegetarian'),
      }
    case 'pescatarian':
      return {
        icon: 'i-lucide-fish',
        color: 'text-blue-700 dark:text-blue-400',
        bg: 'bg-blue-500/10',
        label: t('recipe.dietaryPescatarian'),
      }
    case 'omnivore':
      return {
        icon: 'i-lucide-beef',
        color: 'text-amber-700 dark:text-amber-400',
        bg: 'bg-amber-500/10',
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
    class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
    :class="[config.color, config.bg]"
  >
    <UIcon :name="config.icon" class="size-3.5 shrink-0" />
    {{ config.label }}
  </span>
</template>
