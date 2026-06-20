<script setup lang="ts">
/**
 * Global tour overlay. Mounted once in app.vue so it works across every layout.
 * For each step it navigates to the step's route, waits for the anchor element,
 * highlights it and positions a viewport-clamped panel. Steps whose anchor never
 * appears are auto-skipped so the tour can't dead-end.
 */
const tour = useProductTour()
const route = useRoute()

const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' })
const ready = ref(false)

let runToken = 0

function clearHighlights() {
  if (typeof document === 'undefined') return
  document.querySelectorAll('.tour-highlight').forEach((el) => el.classList.remove('tour-highlight'))
}

function waitForEl(id: string, timeout = 2500): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const startedAt = performance.now()
    const tick = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${id}"]`)
      if (el) return resolve(el)
      if (performance.now() - startedAt > timeout) return resolve(null)
      requestAnimationFrame(tick)
    }
    tick()
  })
}

function positionPanel(anchor: HTMLElement, placement?: 'top' | 'bottom' | 'left' | 'right') {
  const rect = anchor.getBoundingClientRect()
  const panel = panelRef.value
  const pw = panel?.offsetWidth ?? 288
  const ph = panel?.offsetHeight ?? 200
  const GAP = 12
  const M = 8 // viewport margin

  let top: number
  let left: number
  switch (placement) {
    case 'top':
      top = rect.top - GAP - ph
      left = rect.left + rect.width / 2 - pw / 2
      break
    case 'left':
      top = rect.top + rect.height / 2 - ph / 2
      left = rect.left - GAP - pw
      break
    case 'right':
      top = rect.top + rect.height / 2 - ph / 2
      left = rect.right + GAP
      break
    default: // bottom
      top = rect.bottom + GAP
      left = rect.left + rect.width / 2 - pw / 2
  }

  // Clamp inside the viewport (mobile-safe).
  left = Math.max(M, Math.min(left, window.innerWidth - pw - M))
  top = Math.max(M, Math.min(top, window.innerHeight - ph - M))

  panelStyle.value = { top: `${top}px`, left: `${left}px`, transform: 'none' }
}

async function showStep() {
  const myRun = ++runToken
  const step = tour.currentStep.value
  if (!tour.active.value || !step) return

  ready.value = false
  clearHighlights()

  // Navigate to the step's route if needed.
  const target = tour.resolveRoute(step)
  if (target && route.path !== target) {
    await navigateTo(target)
  }
  if (myRun !== runToken) return

  const anchor = await waitForEl(step.id)
  if (myRun !== runToken || !tour.active.value) return

  if (!anchor) {
    // Anchor never appeared — skip rather than dead-end.
    if (tour.isLast.value) tour.finish()
    else tour.next()
    return
  }

  anchor.classList.add('tour-highlight')
  anchor.scrollIntoView({ block: 'center', inline: 'nearest' })
  await nextTick()
  if (myRun !== runToken) return
  positionPanel(anchor, step.placement)
  ready.value = true
}

watch(
  [tour.active, tour.currentIndex],
  () => {
    if (tour.active.value) {
      showStep()
    } else {
      ready.value = false
      clearHighlights()
    }
  },
  { immediate: true }
)

function onResize() {
  const step = tour.currentStep.value
  if (!tour.active.value || !step) return
  const anchor = document.querySelector<HTMLElement>(`[data-tour="${step.id}"]`)
  if (anchor) positionPanel(anchor, step.placement)
}

onMounted(() => window.addEventListener('resize', onResize, { passive: true }))
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  clearHighlights()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="tour">
      <div v-if="tour.active.value && tour.currentStep.value">
        <!-- Dimmed backdrop (click to dismiss) -->
        <div class="fixed inset-0 z-[199] bg-black/40" aria-hidden="true" @click="tour.skip" />

        <!-- Floating step panel -->
        <div
          ref="panelRef"
          class="fixed z-[200] transition-[top,left] duration-200"
          :class="ready ? 'opacity-100' : 'opacity-0'"
          :style="panelStyle"
        >
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
