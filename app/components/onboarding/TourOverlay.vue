<script setup lang="ts">
/**
 * Global tour overlay. Mounted once in app.vue so it works across every layout.
 * For each step it navigates to the step's route, waits for the anchor element,
 * highlights it and positions a viewport-clamped panel. Steps whose anchor never
 * appears are auto-skipped so the tour can't dead-end.
 */
const tour = useProductTour()
const route = useRoute()
const { user } = useUserSession()
const { t } = useI18n()
const toast = useAppToast()

const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' })
const ready = ref(false)

/**
 * The `new-recipe-btn` step doesn't drive navigation itself — its anchor is the real
 * "+ Neues Rezept" button, a plain link to `/recipes/new`. Once the visitor follows it, the
 * overlay has to get out of the way: the fixed backdrop below captures every click on the
 * page (that's what makes it dismiss the tour), which would otherwise sit on top of the
 * create-recipe form and make it unusable. Suspended for exactly the two routes that step
 * can lead to — not simply "not on /dashboard" — so an ordinary step-to-step navigation
 * elsewhere never loses its dimmed backdrop by accident.
 */
const suspended = computed(() => {
  if (tour.currentStep.value?.id !== 'new-recipe-btn') return false
  if (route.path === '/recipes/new') return true
  const editMatch = route.path.match(/^\/([^/]+)\/[^/]+\/edit$/)
  return !!editMatch && editMatch[1] === user.value?.username
})

/**
 * `new-recipe-btn` is the one step where the visitor needs to click something real on the
 * page underneath, not just read the panel and press "Weiter" — and `.tour-highlight`'s
 * `z-index: 200` only wins within its own stacking context, which on this page is lower
 * than the backdrop's: it never actually rises above `z-[199]` fixed over the whole
 * viewport. Rather than fight z-index across contexts, the backdrop simply stops capturing
 * clicks for this one step, so the highlighted "+ Neues Rezept" button underneath is
 * reachable. Click-to-dismiss is still available via the panel's own "Tour überspringen".
 */
const backdropInteractive = computed(() => tour.currentStep.value?.id !== 'new-recipe-btn')

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

/**
 * Ends the tour via an auto-skip (an anchor, or a whole `@recipe` step, that was never
 * reachable) rather than via the visible "Fertig" button on the last panel. Both paths call
 * `tour.finish()`, which has no feedback of its own — fine when the user just clicked
 * "Fertig" on a panel they were looking at, wrong here: the panel had already been hidden
 * for up to several seconds (each skipped step still costs one `waitForEl` round on a real
 * anchor), so the tour would otherwise vanish with no indication of why it stopped, on a
 * page the user did not choose. The toast is the difference between "the tour ended because
 * there was nothing left to show you" and "the tour broke".
 */
function finishEarly() {
  tour.finish()
  toast.info(t('tour.endedEarly'))
}

async function showStep() {
  const myRun = ++runToken
  const step = tour.currentStep.value
  if (!tour.active.value || !step) return

  ready.value = false
  clearHighlights()

  // Navigate to the step's route if needed.
  const target = tour.resolveRoute(step)

  /**
   * A `@recipe`/`@demo` step with no resolved target is not "the anchor hasn't loaded
   * yet" — it is known, right now, to be unreachable: `@recipe` already tried
   * `resolveOtherRecipe()` and found nobody else's public recipe to fork, and `@demo` means
   * the visitor skipped past `new-recipe-btn` without creating one. The ORIGINAL code
   * called `waitForEl` on the CURRENT page for an anchor from a page it never navigated to,
   * waited out the full 2500ms timeout, then repeated that for every remaining such step —
   * with the panel hidden (`ready` stays false) and only the dimmed backdrop visible the
   * whole time. That reads as the tour being stuck, not as it working; it was reported
   * exactly that way. Recognising the impossible case here skips straight to the next step
   * (or finishes, with the toast below) instead of manufacturing a wait for an outcome that
   * is already decided.
   */
  if ((step.route === '@recipe' || step.route === '@demo') && !target) {
    if (myRun !== runToken) return
    if (tour.isLast.value) finishEarly()
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
    if (tour.isLast.value) finishEarly()
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

/**
 * Watches for the arrival that only a successful save on `/recipes/new` produces
 * (`recipes/new.vue` redirects to `/<owner>/<slug>/edit`), and hands that recipe to the
 * tour as the target for the remaining steps. Scoped to the visitor's OWN username so it
 * can't fire on an unrelated edit page, and to `!tour.demoRecipeUrl.value` so it only ever
 * fires once per tour run.
 */
watch(
  () => route.path,
  async (path) => {
    if (!tour.active.value || tour.currentStep.value?.id !== 'new-recipe-btn') return
    if (tour.demoRecipeUrl.value) return
    const match = path.match(/^\/([^/]+)\/([^/]+)\/edit$/)
    if (!match) return
    const [, username, slug] = match
    if (username !== user.value?.username) return
    try {
      const recipe = await $fetch<{ id: number }>(`/api/recipes/by-slug/${username}/${slug}`)
      tour.setDemoRecipe({ id: recipe.id, url: `/${username}/${slug}` })
      tour.next()
    } catch {
      // Lookup failed — leave the step alone; the visitor can still press "Weiter".
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
        <!-- Dimmed backdrop (click to dismiss, except while new-recipe-btn needs a real click through to the page) -->
        <div
          class="fixed inset-0 z-[199] bg-black/40"
          :class="backdropInteractive ? '' : 'pointer-events-none'"
          aria-hidden="true"
          @click="backdropInteractive && tour.skip()"
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
