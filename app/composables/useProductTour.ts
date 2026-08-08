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
  /** Hides "Weiter"/"Fertig" — only `Zurück`/skip stay available. Forces steps like
   *  `recipe-form-title` to advance via the real form submit, not a one-click skip past it. */
  hideNext?: boolean
}

const BASE_TOUR: TourStep[] = [
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
    id: 'recipe-form-title',
    route: '/recipes/new',
    titleKey: 'tour.step.recipeForm.title',
    descKey: 'tour.step.recipeForm.desc',
    placement: 'top',
    hideNext: true,
  },
  {
    id: 'add-ingredient',
    route: '@demo-edit',
    titleKey: 'tour.step.addIngredient.title',
    descKey: 'tour.step.addIngredient.desc',
    placement: 'bottom',
  },
  {
    id: 'add-step',
    route: '@demo-edit',
    titleKey: 'tour.step.addStep.title',
    descKey: 'tour.step.addStep.desc',
    placement: 'bottom',
  },
  {
    id: 'commit-button',
    route: '@demo-edit',
    titleKey: 'tour.step.commit.title',
    descKey: 'tour.step.commit.desc',
    placement: 'top',
  },
  {
    id: 'view-recipe-btn',
    route: '@demo-edit',
    titleKey: 'tour.step.viewRecipe.title',
    descKey: 'tour.step.viewRecipe.desc',
    placement: 'bottom',
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
    id: 'favorites-nav',
    route: '@demo',
    titleKey: 'tour.step.favorites.title',
    descKey: 'tour.step.favorites.desc',
    placement: 'right',
  },
  {
    id: 'tour-pointers',
    route: '@demo',
    titleKey: 'tour.step.pointers.title',
    descKey: 'tour.step.pointers.desc',
    placement: 'bottom',
  },
  {
    id: 'edit-recipe-btn',
    route: '@demo',
    titleKey: 'tour.step.editRecipe.title',
    descKey: 'tour.step.editRecipe.desc',
    placement: 'bottom',
    hideNext: true,
  },
  {
    id: 'delete-demo',
    route: '@demo-edit',
    titleKey: 'tour.step.deleteDemo.title',
    descKey: 'tour.step.deleteDemo.desc',
    placement: 'bottom',
    hideNext: true,
  },
]

const BRANCHES_TOUR: TourStep[] = [
  {
    id: 'new-branch-btn',
    route: '@demo-branches',
    titleKey: 'tour.step.newBranch.title',
    descKey: 'tour.step.newBranch.desc',
    placement: 'bottom',
  },
  {
    id: 'branch-name-input',
    route: '@demo-branches',
    titleKey: 'tour.step.branchName.title',
    descKey: 'tour.step.branchName.desc',
    placement: 'right',
    hideNext: true,
  },
  {
    id: 'branch-created',
    route: '@demo-branches',
    titleKey: 'tour.step.branchCreated.title',
    descKey: 'tour.step.branchCreated.desc',
    placement: 'bottom',
  },
]

const HISTORY_TOUR: TourStep[] = [
  {
    id: 'history-page',
    route: '@demo-history',
    titleKey: 'tour.step.historyPage.title',
    descKey: 'tour.step.historyPage.desc',
    placement: 'bottom',
  },
]

const GMR_TOUR: TourStep[] = [
  {
    id: 'gmr-page',
    route: '@demo-gmr',
    titleKey: 'tour.step.gmrPage.title',
    descKey: 'tour.step.gmrPage.desc',
    placement: 'bottom',
  },
]

const FORK_TOUR: TourStep[] = [
  {
    id: 'fork-button',
    route: '@system',
    titleKey: 'tour.step.forkAction.title',
    descKey: 'tour.step.forkAction.desc',
    placement: 'bottom',
    hideNext: true,
  },
  {
    id: 'delete-fork',
    route: '@fork-edit',
    titleKey: 'tour.step.deleteFork.title',
    descKey: 'tour.step.deleteFork.desc',
    placement: 'bottom',
    hideNext: true,
  },
]

// Module-level reactive state shared across all callers.
const active = ref(false)
const activeTourName = ref<string>('base')
const currentSteps = ref<TourStep[]>([])
const currentIndex = ref(0)
const demoRecipe = ref<{ id: number; url: string } | null>(null)
const systemRecipeUrl = ref<string | null>(null)
const forkedRecipeUrl = ref<string | null>(null)

export function useProductTour() {
  const { dismissTour, finishTour, markTourCompleted } = useOnboarding()

  const currentStep = computed(() => currentSteps.value[currentIndex.value] ?? null)
  const isFirst = computed(() => currentIndex.value === 0)
  const isLast = computed(() => currentIndex.value >= currentSteps.value.length - 1)
  const progress = computed(() => ({ current: currentIndex.value + 1, total: currentSteps.value.length }))
  const demoRecipeUrl = computed(() => demoRecipe.value?.url ?? null)

  /** Resolve the route a step navigates to ('@system' / '@demo' / '@fork' → the matching target). */
  function resolveRoute(step: TourStep): string | null {
    if (step.route === '@demo') return demoRecipe.value ? demoRecipe.value.url : null
    if (step.route === '@demo-edit') return demoRecipe.value ? `${demoRecipe.value.url}/edit` : null
    if (step.route === '@demo-history') return demoRecipe.value ? `${demoRecipe.value.url}/history` : null
    if (step.route === '@demo-gmr') return demoRecipe.value ? `${demoRecipe.value.url}/gourmerge-requests` : null
    if (step.route === '@demo-branches') return demoRecipe.value ? `${demoRecipe.value.url}/branches` : null
    if (step.route === '@system') return systemRecipeUrl.value ? systemRecipeUrl.value : null
    if (step.route === '@fork-edit') return forkedRecipeUrl.value ? `${forkedRecipeUrl.value}/edit` : null
    return step.route
  }

  /** Find the system tour recipe. */
  async function resolveSystemRecipe(): Promise<string | null> {
    try {
      const res = await $fetch<{ url: string }>('/api/recipes/tour-recipe')
      return res.url
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

  function setForkedRecipe(recipe: { id: number; url: string }) {
    forkedRecipeUrl.value = recipe.url
  }

  async function start(tourName: 'base' | 'branches' | 'history' | 'gmr' | 'fork' = 'base', recipeUrlContext?: string) {
    // Not gated on isDone/tourDismissed/hasFinishedTour: every caller already gates itself
    // (ConceptIntro only calls this when isDone is false; the help menu's restart actions are
    // meant to relaunch a finished tour; sub-tours gate on !hasCompletedTour(name)).
    if (recipeUrlContext) {
      if (tourName === 'fork') systemRecipeUrl.value = recipeUrlContext
      else demoRecipe.value = { id: 0, url: recipeUrlContext }
    } else if (tourName === 'base' || tourName === 'fork') {
      systemRecipeUrl.value = await resolveSystemRecipe()
    }

    activeTourName.value = tourName
    switch (tourName) {
      case 'base':
        currentSteps.value = BASE_TOUR
        break
      case 'branches':
        currentSteps.value = BRANCHES_TOUR
        break
      case 'history':
        currentSteps.value = HISTORY_TOUR
        break
      case 'gmr':
        currentSteps.value = GMR_TOUR
        break
      case 'fork':
        currentSteps.value = FORK_TOUR
        break
    }
    currentIndex.value = 0
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

  // Sub-tours point demoRecipe at a real recipe (id: 0 placeholder), not a throwaway one to
  // delete, and must not trip the base tour's global dismissTour() — just mark that sub-tour done.
  function skip() {
    active.value = false
    if (activeTourName.value === 'base') {
      cleanupDemoRecipe()
      dismissTour()
    } else if (activeTourName.value) {
      markTourCompleted(activeTourName.value)
    }
    demoRecipe.value = null
    systemRecipeUrl.value = null
    forkedRecipeUrl.value = null
  }

  function finish() {
    active.value = false

    if (activeTourName.value === 'base') {
      finishTour()
    } else if (activeTourName.value) {
      markTourCompleted(activeTourName.value)
    }

    demoRecipe.value = null
    systemRecipeUrl.value = null
    forkedRecipeUrl.value = null
  }

  return {
    active,
    currentStep,
    currentIndex,
    isFirst,
    isLast,
    progress,
    systemRecipeUrl,
    demoRecipeUrl,
    forkedRecipeUrl,
    resolveRoute,
    setDemoRecipe,
    setForkedRecipe,
    start,
    next,
    prev,
    skip,
    finish,
  }
}
