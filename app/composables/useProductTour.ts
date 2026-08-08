/**
 * Product tour driver built on Nuxt UI primitives.
 *
 * A tour step anchors to a `data-tour="<id>"` element that lives on a specific
 * route. '@recipe' resolves to another user's public recipe (so the Fork button has
 * somewhere to point); '@demo' resolves to the recipe the visitor creates through the
 * real `/recipes/new` form during the tour itself — see `TourOverlay`'s route watcher.
 * The overlay handles navigation, polling for the anchor, viewport clamping and
 * auto-skipping steps whose anchor never appears — so the tour never dead-ends.
 */

export interface TourStep {
  /** data-tour anchor id */
  id: string
  /** Route the anchor lives on. '@recipe' / '@demo' resolve dynamically — see above. */
  route: string
  titleKey: string
  descKey: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  /**
   * Overrides the panel's "Weiter" label AND its action — see `TourOverlay.handleNext()`.
   * Only `new-recipe-btn` sets this: without it, "Weiter" is indistinguishable from every
   * other step's "just move on", which is exactly what visitors do here out of habit, and
   * doing so must not silently skip creating the demo recipe the rest of the tour depends on.
   */
  nextLabelKey?: string
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
    nextLabelKey: 'recipe.createButton',
  },
  {
    id: 'star-button',
    route: '@demo',
    titleKey: 'tour.step.star.title',
    descKey: 'tour.step.star.desc',
    placement: 'bottom',
  },
  {
    id: 'history-link',
    route: '@demo',
    titleKey: 'tour.step.history.title',
    descKey: 'tour.step.history.desc',
    placement: 'bottom',
  },
  {
    id: 'gourmerge-requests-link',
    route: '@demo',
    titleKey: 'tour.step.gourmergeRequest.title',
    descKey: 'tour.step.gourmergeRequest.desc',
    placement: 'bottom',
  },
  // Last, deliberately: forking your own brand-new recipe makes no sense, so this is the
  // one step that still needs SOMEONE ELSE's public recipe. Putting it after the
  // create-your-own-recipe steps means the tour only ever jumps to a stranger's recipe
  // once, right at the end, instead of ping-ponging between "yours" and "theirs".
  {
    id: 'fork-button',
    route: '@recipe',
    titleKey: 'tour.step.fork.title',
    descKey: 'tour.step.fork.desc',
    placement: 'bottom',
  },
]

// Module-level reactive state shared across all callers.
const active = ref(false)
const currentIndex = ref(0)
const otherRecipeUrl = ref<string | null>(null)
const demoRecipe = ref<{ id: number; url: string } | null>(null)

export function useProductTour(steps: TourStep[] = DEFAULT_STEPS) {
  const { dismissTour } = useOnboarding()
  const { user } = useUserSession()

  const currentStep = computed(() => steps[currentIndex.value] ?? null)
  const isFirst = computed(() => currentIndex.value === 0)
  const isLast = computed(() => currentIndex.value === steps.length - 1)
  const progress = computed(() => ({ current: currentIndex.value + 1, total: steps.length }))
  const demoRecipeUrl = computed(() => demoRecipe.value?.url ?? null)

  /** Resolve the route a step navigates to ('@recipe' / '@demo' → the matching target). */
  function resolveRoute(step: TourStep): string | null {
    if (step.route === '@recipe') return otherRecipeUrl.value
    if (step.route === '@demo') return demoRecipeUrl.value
    return step.route
  }

  /** Find a PUBLIC recipe owned by someone else, to demo the Fork button on. */
  async function resolveOtherRecipe(): Promise<string | null> {
    try {
      const ex = await $fetch<{ recipes: Array<{ ownerUsername: string; slug: string }> }>('/api/recipes/explore', {
        query: { limit: 12 },
      })
      const other = ex.recipes.find((r) => r.ownerUsername !== user.value?.username)
      return other ? `/${other.ownerUsername}/${other.slug}` : null
    } catch {
      return null
    }
  }

  /**
   * Records the recipe the visitor just created through the real `/recipes/new` form
   * while the `new-recipe-btn` step was active — see `TourOverlay`'s route watcher, which
   * is what calls this. Deliberately not a background API call that fabricates one:
   * onboarding is supposed to teach recipe creation, not fake it.
   */
  function setDemoRecipe(recipe: { id: number; url: string }) {
    demoRecipe.value = recipe
  }

  async function start() {
    currentIndex.value = 0
    demoRecipe.value = null
    otherRecipeUrl.value = await resolveOtherRecipe()
    active.value = true
  }

  function next() {
    if (isLast.value) finish()
    else currentIndex.value++
  }

  function prev() {
    if (!isFirst.value) currentIndex.value--
  }

  /**
   * The demo recipe only exists to carry the tour, so every exit path deletes it —
   * best-effort, since this is cleanup rather than something the visitor is waiting on.
   * A tour abandoned outright (closed tab, no "Fertig"/"Überspringen") leaves it behind,
   * same as any other draft a visitor walks away from; nothing here polls for that.
   */
  function cleanupDemoRecipe() {
    const recipe = demoRecipe.value
    if (!recipe) return
    demoRecipe.value = null
    $fetch(`/api/recipes/${recipe.id}`, { method: 'DELETE' }).catch(() => {})
  }

  function skip() {
    active.value = false
    cleanupDemoRecipe()
    dismissTour()
  }

  function finish() {
    active.value = false
    cleanupDemoRecipe()
    dismissTour()
  }

  return {
    active,
    currentStep,
    currentIndex,
    isFirst,
    isLast,
    progress,
    otherRecipeUrl,
    demoRecipeUrl,
    resolveRoute,
    setDemoRecipe,
    start,
    next,
    prev,
    skip,
    finish,
  }
}
