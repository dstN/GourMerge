/**
 * Lightweight product tour driver built on Nuxt UI primitives.
 * Anchors steps to `data-tour="<step-id>"` attributes on DOM elements.
 * Opt-in, skippable, and re-runnable from the help menu.
 */

export interface TourStep {
  id: string
  titleKey: string
  descKey: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

const DEFAULT_STEPS: TourStep[] = [
  { id: 'nav-explore', titleKey: 'tour.step.explore.title', descKey: 'tour.step.explore.desc', placement: 'bottom' },
  { id: 'new-recipe-btn', titleKey: 'tour.step.newRecipe.title', descKey: 'tour.step.newRecipe.desc', placement: 'bottom' },
  { id: 'fork-button', titleKey: 'tour.step.fork.title', descKey: 'tour.step.fork.desc', placement: 'bottom' },
  { id: 'star-button', titleKey: 'tour.step.star.title', descKey: 'tour.step.star.desc', placement: 'bottom' },
  { id: 'history-link', titleKey: 'tour.step.history.title', descKey: 'tour.step.history.desc', placement: 'left' },
  { id: 'gourmerge-requests-link', titleKey: 'tour.step.gourmergeRequest.title', descKey: 'tour.step.gourmergeRequest.desc', placement: 'left' },
]

const active = ref(false)
const currentIndex = ref(0)

export function useProductTour(steps: TourStep[] = DEFAULT_STEPS) {
  const { dismissTour } = useOnboarding()

  const currentStep = computed(() => steps[currentIndex.value] ?? null)
  const isFirst = computed(() => currentIndex.value === 0)
  const isLast = computed(() => currentIndex.value === steps.length - 1)
  const progress = computed(() => ({ current: currentIndex.value + 1, total: steps.length }))

  // Find the DOM anchor for the current step
  const anchorEl = computed<HTMLElement | null>(() => {
    if (!active.value || !currentStep.value) return null
    if (typeof document === 'undefined') return null
    return document.querySelector(`[data-tour="${currentStep.value.id}"]`) as HTMLElement | null
  })

  function start() {
    currentIndex.value = 0
    active.value = true
  }

  function next() {
    if (isLast.value) {
      finish()
    } else {
      currentIndex.value++
    }
  }

  function prev() {
    if (!isFirst.value) currentIndex.value--
  }

  function skip() {
    active.value = false
    dismissTour()
  }

  function finish() {
    active.value = false
    dismissTour()
  }

  return { active, currentStep, currentIndex, isFirst, isLast, progress, anchorEl, start, next, prev, skip, finish }
}
