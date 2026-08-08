<script setup lang="ts">
/**
 * Global tour overlay. Mounted once in app.vue so it works across every layout.
 * For each step it navigates to the step's route, waits for the anchor element,
 * highlights it and positions a viewport-clamped panel. Steps whose anchor never
 * appears are auto-skipped so the tour can't dead-end.
 */
import type { TourStep } from '~/composables/useProductTour'

const tour = useProductTour()
const route = useRoute()
const { user } = useUserSession()
const { t } = useI18n()
const toast = useAppToast()

const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' })
const ready = ref(false)

// `recipe-form-title`/`fork-button` stay visible through the post-submit redirect to
// `/<owner>/<slug>/edit` (which has no matching anchor yet) until the route watcher below
// advances the step — suspended for exactly that one transitional route.
const suspended = computed(() => {
  if (!tour.currentStep.value) return false
  const id = tour.currentStep.value.id
  if (id === 'recipe-form-title' || id === 'fork-button') {
    const editMatch = route.path.match(/^\/([^/]+)\/[^/]+\/edit$/)
    return !!editMatch && editMatch[1] === user.value?.username
  }
  return false
})

// Steps where the visitor must click through to the real page (the highlighted "+ Neues
// Rezept" link, or the real form fields under `hideNext: true`) — the backdrop otherwise
// captures every click, and `.tour-highlight`'s z-index alone can't win against it across
// stacking contexts. "Tour überspringen" on the panel is still available either way.
const backdropInteractive = computed(
  () =>
    ![
      'new-recipe-btn',
      'recipe-form-title',
      'add-ingredient',
      'add-step',
      'commit-button',
      'view-recipe-btn',
      'edit-recipe-btn',
      'delete-demo',
      'fork-button',
      'delete-fork',
      'star-button',
      'new-branch-btn',
    ].includes(tour.currentStep.value?.id ?? '')
)

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

// tour.finish() has no feedback of its own, so an auto-skip ending (anchor/route never
// reachable) needs its own toast — the panel's been hidden silently for a few seconds already.
// fork-button is always the last step, so landing here for it means everything before it
// (recipe, star, history, GMR) already succeeded and only forking someone else's recipe has
// nothing to demo — a different message than the generic "tour ended early" case.
function finishEarly(step: TourStep) {
  tour.finish()
  if (step.id === 'fork-button') {
    toast.success(t('tour.finishedNoFork'))
  } else {
    toast.info(t('tour.endedEarly'))
  }
}

async function showStep() {
  const myRun = ++runToken
  const step = tour.currentStep.value
  if (!tour.active.value || !step) return

  ready.value = false
  clearHighlights()

  // Navigate to the step's route if needed.
  const target = tour.resolveRoute(step)

  // A `@`-prefixed step (`@demo`, `@system`, `@fork-edit`, …) with no resolved target is known
  // unreachable right now (e.g. the demo recipe was never created, or the fork hasn't happened
  // yet) — skip straight to the next step instead of waiting out waitForEl's timeout for it.
  if (step.route.startsWith('@') && !target) {
    if (myRun !== runToken) return
    if (tour.isLast.value) finishEarly(step)
    else tour.next()
    return
  }

  if (target && route.path !== target) {
    await navigateTo(target)
  }
  if (myRun !== runToken) return

  const anchor = await waitForEl(step.id)
  if (myRun !== runToken || !tour.active.value) return

  if (!anchor) {
    // Anchor never appeared — skip rather than dead-end.
    if (tour.isLast.value) finishEarly(step)
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

// Clicking the highlighted "+ Neues Rezept" link directly bypasses tour.next() — this catches
// that path too, so currentIndex advances to recipe-form-title regardless of how the visitor got here.
watch(
  () => route.path,
  (path) => {
    if (tour.currentStep.value?.id === 'new-recipe-btn' && path === '/recipes/new') tour.next()
  }
)

watch(
  () => route.path,
  async (path) => {
    if (!tour.active.value || !tour.currentStep.value) return
    const stepId = tour.currentStep.value.id

    // Demo recipe creation transition
    if (stepId === 'recipe-form-title' && !tour.demoRecipeUrl.value) {
      const match = path.match(/^\/([^/]+)\/([^/]+)\/edit$/)
      if (match && match[1] === user.value?.username) {
        try {
          const recipe = await $fetch<{ id: number }>(`/api/recipes/by-slug/${match[1]}/${match[2]}`)
          tour.setDemoRecipe({ id: recipe.id, url: `/${match[1]}/${match[2]}` })

          // Seed the new recipe with simulated history and GMR in the background
          // so it's ready by the time the tour reaches those steps.
          $fetch(`/api/recipes/${recipe.id}/simulate-activity`, { method: 'POST' }).catch(() => {})

          tour.next()
        } catch {
          // ignore lookup errors
        }
      }
      return
    }

    // Fork recipe creation transition
    if (stepId === 'fork-button' && !tour.forkedRecipeUrl.value) {
      const match = path.match(/^\/([^/]+)\/([^/]+)$/)
      if (match && match[1] === user.value?.username) {
        try {
          const recipe = await $fetch<{ id: number }>(`/api/recipes/by-slug/${match[1]}/${match[2]}`)
          tour.setForkedRecipe({ id: recipe.id, url: `/${match[1]}/${match[2]}` })
          tour.next()
        } catch {
          // ignore lookup errors
        }
      }
      return
    }

    // View / Edit manual navigation transitions
    if (stepId === 'view-recipe-btn' && path === tour.demoRecipeUrl.value) {
      tour.next()
      return
    }
    if (stepId === 'edit-recipe-btn' && path === `${tour.demoRecipeUrl.value}/edit`) {
      tour.next()
      return
    }

    // Delete transitions (redirects to /recipes)
    if (stepId === 'delete-demo' && path === '/recipes') {
      tour.next()
      return
    }
    if (stepId === 'delete-fork' && path === '/recipes') {
      tour.next() // Calls finish() since it's the last step
      return
    }
  }
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
      <div v-if="tour.active.value && tour.currentStep.value && !suspended">
        <!-- Dimmed backdrop (click to dismiss, except while recipe-form-title needs real clicks through to the form) -->
        <div
          class="fixed inset-0 z-[199] bg-black/40"
          :class="backdropInteractive ? '' : 'pointer-events-none'"
          aria-hidden="true"
        />

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
