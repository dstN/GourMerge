/**
 * Product tour driver built on Nuxt UI primitives.
 *
 * A tour step anchors to a `data-tour="<id>"` element that lives on a specific
 * route. '@recipe' resolves to another user's public recipe (so the Fork button has
 * somewhere to point); '@demo' resolves to the recipe the visitor creates through the
 * real `/recipes/new` form during the `recipe-form-title` step — the tour stays visible
 * and anchored to that form (not hidden) while they fill it in, and `TourOverlay`'s
 * route watcher picks the tour back up once they submit it. The overlay handles
 * navigation, polling for the anchor, viewport clamping and auto-skipping steps whose
 * anchor never appears — so the tour never dead-ends.
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
   * Hides the panel's "Weiter"/"Fertig" button — only `Zurück` and abandoning the tour
   * outright stay available. Set on `recipe-form-title`: that step's entire point is
   * getting the visitor to submit the REAL create-recipe form, and a "Weiter" that just
   * calls `next()` would be a one-click way to skip past it, leaving `star-button` /
   * `history-link` / `gourmerge-requests-link` (`route: '@demo'`) with nothing to point at —
   * the exact dead end this whole rework exists to avoid.
   */
  hideNext?: boolean
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
  // Anchors on the REAL create-recipe form's title field — this is the "with the user"
  // part: the tour stays put and visible while they actually fill it in, rather than
  // vanishing at the door and picking back up only once they emerge. No `route: '@demo'`
  // involved yet because there is no recipe to point at until they submit. `recipes/new.vue`
  // reads `tour.active` directly (not a `?tour=1` query) to default visibility to private —
  // reactive and already true by the time ANY path reaches this page, regardless of
  // whether the visitor clicked "Weiter" or the highlighted link directly.
  {
    id: 'recipe-form-title',
    route: '/recipes/new',
    titleKey: 'tour.step.recipeForm.title',
    descKey: 'tour.step.recipeForm.desc',
    placement: 'top',
    hideNext: true,
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
   * while the `recipe-form-title` step was active — see `TourOverlay`'s route watcher,
   * which is what calls this. Deliberately not a background API call that fabricates one:
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
