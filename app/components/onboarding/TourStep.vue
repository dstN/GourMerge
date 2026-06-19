<script setup lang="ts">
import type { TourStep } from '~/composables/useProductTour'

defineProps<{ step: TourStep; progress: { current: number; total: number } }>()
const emit = defineEmits<{
  next: []
  prev: []
  skip: []
}>()

const { t } = useI18n()
</script>

<template>
  <div
    class="fixed z-[200] bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded-xl shadow-xl p-4 w-72"
    role="dialog"
    aria-modal="true"
    :aria-label="t(step.titleKey)"
  >
    <!-- Progress -->
    <div class="flex items-center justify-between mb-3">
      <span class="text-xs text-[var(--ui-text-dimmed)]"> {{ progress.current }} / {{ progress.total }} </span>
      <UProgress :value="(progress.current / progress.total) * 100" size="xs" class="w-24" />
      <UButton
        icon="i-lucide-x"
        size="xs"
        variant="ghost"
        color="neutral"
        :aria-label="t('tour.skip')"
        @click="emit('skip')"
      />
    </div>

    <!-- Content -->
    <h3 class="font-semibold text-sm mb-1">{{ t(step.titleKey) }}</h3>
    <p class="text-sm text-[var(--ui-text-muted)] mb-4">{{ t(step.descKey) }}</p>

    <!-- Navigation -->
    <div class="flex items-center justify-between gap-2">
      <UButton :label="t('tour.skip')" variant="ghost" color="neutral" size="xs" @click="emit('skip')" />
      <div class="flex items-center gap-1.5">
        <UButton
          v-if="progress.current > 1"
          icon="i-lucide-arrow-left"
          variant="ghost"
          color="neutral"
          size="xs"
          :aria-label="t('tour.prev')"
          @click="emit('prev')"
        />
        <UButton
          :label="progress.current === progress.total ? t('tour.finish') : t('tour.next')"
          :icon="progress.current === progress.total ? 'i-lucide-check' : 'i-lucide-arrow-right'"
          trailing
          size="xs"
          @click="emit('next')"
        />
      </div>
    </div>

    <!-- Pointer arrow pointing at the anchored element -->
    <div
      :class="[
        'absolute w-3 h-3 bg-[var(--ui-bg)] border-[var(--ui-border)] rotate-45',
        step.placement === 'top' ? 'bottom-[-6px] left-1/2 -translate-x-1/2 border-b border-r' : '',
        step.placement === 'bottom' ? 'top-[-6px] left-1/2 -translate-x-1/2 border-t border-l' : '',
        step.placement === 'left' ? 'right-[-6px] top-1/2 -translate-y-1/2 border-t border-r' : '',
        step.placement === 'right' ? 'left-[-6px] top-1/2 -translate-y-1/2 border-b border-l' : '',
        !step.placement ? 'hidden' : '',
      ]"
    />
  </div>
</template>
