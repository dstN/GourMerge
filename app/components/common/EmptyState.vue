<script setup lang="ts">
/**
 * EmptyState — the one look for "nothing here", "not found" and "it broke".
 * DESIGNBOOK §6.1.
 *
 * Usage (Nuxt path-prefixes components in components/common/):
 *   <CommonEmptyState icon="i-lucide-book-open" :title="…" :description="…">
 *     <template #actions><UButton … /></template>
 *   </CommonEmptyState>
 *
 * Replaces two competing looks: a `UCard` with a `size-16` icon and an
 * `h2 text-xl`, and a bare centred `div` with a `size-12` icon at 40% opacity.
 * The card version won because it holds its shape when it lands inside a grid.
 */
withDefaults(
  defineProps<{
    icon: string
    title: string
    description?: string
    /** `error` tints the icon; `neutral` dims it. */
    tone?: 'neutral' | 'error'
  }>(),
  { description: undefined, tone: 'neutral' }
)
</script>

<template>
  <UCard>
    <div class="px-4 py-12 text-center">
      <UIcon
        :name="icon"
        :class="['mx-auto mb-4 size-12', tone === 'error' ? 'text-error-500' : 'text-dimmed']"
        aria-hidden="true"
      />
      <h2 class="text-base font-semibold">{{ title }}</h2>
      <p v-if="description" class="mx-auto mt-1 max-w-md text-muted">{{ description }}</p>
      <div v-if="$slots.actions" class="mt-6 flex flex-wrap items-center justify-center gap-3">
        <slot name="actions" />
      </div>
    </div>
  </UCard>
</template>
