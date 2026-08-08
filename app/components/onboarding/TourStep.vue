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
    class="bg-default border border-default rounded-xl shadow-xl p-4 w-[min(20rem,calc(100vw-1rem))]"
    role="dialog"
    aria-modal="true"
    :aria-label="t(step.titleKey)"
  >
    <!-- Progress -->
    <div class="flex items-center justify-between mb-3">
      <span class="text-xs text-dimmed"> {{ progress.current }} / {{ progress.total }} </span>
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
    <p class="text-sm text-muted mb-4">{{ t(step.descKey) }}</p>

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
          v-if="!step.hideNext"
          :label="progress.current === progress.total ? t('tour.finish') : t('tour.next')"
          :icon="progress.current === progress.total ? 'i-lucide-check' : 'i-lucide-arrow-right'"
          trailing
          size="xs"
          @click="emit('next')"
        />
      </div>
    </div>
  </div>
</template>
