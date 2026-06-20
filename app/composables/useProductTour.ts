/**
 * Product tour driver built on Nuxt UI primitives.
 *
 * A tour step anchors to a `data-tour="<id>"` element that lives on a specific
 * route. The driver resolves a target recipe (preferring a public recipe the
 * viewer can fork) so the recipe-feature steps have somewhere to point. The
 * overlay handles navigation, polling for the anchor, viewport clamping and
 * auto-skipping steps whose anchor never appears — so the tour never dead-ends.
 */

export interface TourStep {
  /** data-tour anchor id */
  id: string
  /** Route the anchor lives on. '@recipe' resolves to the target recipe URL. */
  route: string
  titleKey: string
  descKey: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

const DEFAULT_STEPS: TourStep[] = [
  {
    id: 'explore-search',
    route: '/explore',
    titleKey: 'tour.step.explore.title',
    descKey: 'tour.step.explore.desc',
    placement: 'bottom',
  },
  {
    id: 'new-recipe-btn',
    route: '/dashboard',
    titleKey: 'tour.step.newRecipe.title',
    descKey: 'tour.step.newRecipe.desc',
    placement: 'bottom',
  },
  {
    id: 'fork-button',
    route: '@recipe',
    titleKey: 'tour.step.fork.title',
    descKey: 'tour.step.fork.desc',
    placement: 'bottom',
  },
  {
    id: 'star-button',
    route: '@recipe',
    titleKey: 'tour.step.star.title',
    descKey: 'tour.step.star.desc',
    placement: 'bottom',
  },
  {
    id: 'history-link',
    route: '@recipe',
    titleKey: 'tour.step.history.title',
    descKey: 'tour.step.history.desc',
    placement: 'bottom',
  },
  {
    id: 'gourmerge-requests-link',
    route: '@recipe',
    titleKey: 'tour.step.gourmergeRequest.title',
    descKey: 'tour.step.gourmergeRequest.desc',
    placement: 'bottom',
  },
]

// Module-level reactive state shared across all callers.
const active = ref(false)
const currentIndex = ref(0)
const targetRecipeUrl = ref<string | null>(null)

export function useProductTour(steps: TourStep[] = DEFAULT_STEPS) {
  const { dismissTour } = useOnboarding()
  const { user } = useUserSession()

  const currentStep = computed(() => steps[currentIndex.value] ?? null)
  const isFirst = computed(() => currentIndex.value === 0)
  const isLast = computed(() => currentIndex.value === steps.length - 1)
  const progress = computed(() => ({ current: currentIndex.value + 1, total: steps.length }))

  /** Resolve the route a step navigates to ('@recipe' → the target recipe). */
  function resolveRoute(step: TourStep): string | null {
    return step.route === '@recipe' ? targetRecipeUrl.value : step.route
  }

  /** Find a recipe to demo the fork/star/history/GMR steps on. */
  async function resolveTargetRecipe(): Promise<string | null> {
    try {
      const ex = await $fetch<{ recipes: Array<{ ownerUsername: string; slug: string }> }>('/api/recipes/explore', {
        query: { limit: 12 },
      })
      // Prefer a public recipe the viewer does NOT own (so the Fork button shows).
      const other = ex.recipes.find((r) => r.ownerUsername !== user.value?.username) ?? ex.recipes[0]
      if (other) return `/${other.ownerUsername}/${other.slug}`
    } catch {
      // ignore
    }
    try {
      const own = await $fetch<Array<{ owner: { username: string }; slug: string }>>('/api/recipes')
      if (own?.length && own[0]) return `/${own[0].owner.username}/${own[0].slug}`
    } catch {
      // ignore
    }
    return null
  }

  async function start() {
    currentIndex.value = 0
    targetRecipeUrl.value = await resolveTargetRecipe()
    active.value = true
  }

  function next() {
    if (isLast.value) finish()
    else currentIndex.value++
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

  return {
    active,
    currentStep,
    currentIndex,
    isFirst,
    isLast,
    progress,
    targetRecipeUrl,
    resolveRoute,
    start,
    next,
    prev,
    skip,
    finish,
  }
}
