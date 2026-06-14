<script setup lang="ts">
const { t } = useI18n()
const props = defineProps<{ type?: string | null }>()

const config = computed(() => {
  switch (props.type) {
    case 'vegan': return { icon: 'i-lucide-leaf', color: 'text-green-500', bg: 'bg-green-500/10', label: t('recipe.dietaryVegan') }
    case 'vegetarian': return { icon: 'i-lucide-sprout', color: 'text-lime-500', bg: 'bg-lime-500/10', label: t('recipe.dietaryVegetarian') }
    case 'pescatarian': return { icon: 'i-lucide-fish', color: 'text-blue-400', bg: 'bg-blue-400/10', label: t('recipe.dietaryPescatarian') }
    case 'omnivore': return { icon: 'i-lucide-beef', color: 'text-amber-500', bg: 'bg-amber-500/10', label: t('recipe.dietaryOmnivore') }
    default: return null
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
