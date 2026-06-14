<script setup lang="ts">
const tour = useProductTour()

// Position the TourStep panel relative to the anchor element.
const position = ref({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' })

watch([tour.active, tour.currentIndex], () => {
  nextTick(() => {
    const anchor = tour.anchorEl.value
    if (!anchor) {
      position.value = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
      return
    }

    const rect = anchor.getBoundingClientRect()
    const placement = tour.currentStep.value?.placement ?? 'bottom'
    const GAP = 12

    // Highlight the anchor element
    anchor.classList.add('tour-highlight')

    if (placement === 'bottom') {
      position.value = {
        top: `${rect.bottom + GAP + window.scrollY}px`,
        left: `${rect.left + rect.width / 2}px`,
        transform: 'translateX(-50%)',
      }
    } else if (placement === 'top') {
      position.value = {
        top: `${rect.top - GAP + window.scrollY}px`,
        left: `${rect.left + rect.width / 2}px`,
        transform: 'translate(-50%, -100%)',
      }
    } else if (placement === 'right') {
      position.value = {
        top: `${rect.top + rect.height / 2 + window.scrollY}px`,
        left: `${rect.right + GAP}px`,
        transform: 'translateY(-50%)',
      }
    } else {
      position.value = {
        top: `${rect.top + rect.height / 2 + window.scrollY}px`,
        left: `${rect.left - GAP}px`,
        transform: 'translate(-100%, -50%)',
      }
    }

    // Scroll the anchor into view
    anchor.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}, { immediate: true })

// Remove highlight when tour ends or step changes
watch(tour.currentIndex, (_, _oldIdx) => {
  if (typeof document === 'undefined') return
  const steps = document.querySelectorAll('[data-tour]')
  steps.forEach((el) => el.classList.remove('tour-highlight'))
})
watch(tour.active, (val) => {
  if (!val && typeof document !== 'undefined') {
    document.querySelectorAll('[data-tour]').forEach((el) => el.classList.remove('tour-highlight'))
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="tour">
      <div v-if="tour.active.value && tour.currentStep.value">
        <!-- Dimmed backdrop -->
        <div
          class="fixed inset-0 z-[199] bg-black/40 pointer-events-none"
          aria-hidden="true"
        />

        <!-- Floating step panel -->
        <div class="absolute z-[200]" :style="position">
          <OnboardingTourStep
            :step="tour.currentStep.value"
            :progress="tour.progress.value"
            @next="tour.next"
            @prev="tour.prev"
            @skip="tour.skip"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
.tour-highlight {
  outline: 2px solid var(--color-primary-500, #f97316);
  outline-offset: 3px;
  border-radius: 6px;
  position: relative;
  z-index: 200;
}

.tour-enter-active,
.tour-leave-active {
  transition: opacity 0.2s ease;
}
.tour-enter-from,
.tour-leave-to {
  opacity: 0;
}
</style>
