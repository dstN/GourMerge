<script setup lang="ts">
/**
 * Cookie banner + settings modal, mounted once globally in app.vue so it
 * covers every layout (public, dashboard, auth).
 *
 * "Necessary" cannot be opted out of — it is not a toggle, just an
 * informational row — the site cannot function without those cookies.
 * Only `statistics`/`marketing` are real choices here.
 */
const { t } = useI18n()
const { hasDecided, isSettingsOpen, consent, acceptAll, acceptNecessaryOnly, apply } = useCookieConsent()

const draft = reactive<{ statistics: boolean; marketing: boolean }>({
  statistics: false,
  marketing: false,
})

watch(isSettingsOpen, (open) => {
  if (!open) return
  draft.statistics = consent.value?.statistics ?? false
  draft.marketing = consent.value?.marketing ?? false
})

function saveSettings() {
  apply({ statistics: draft.statistics, marketing: draft.marketing })
}

/**
 * The banner is `position: fixed` at the viewport bottom, painted on top of
 * whichever layout is showing rather than inside its scroll flow. A short
 * page's last interactive element (e.g. a form's submit button) can end up
 * scrolled fully into view yet still physically covered — real for a visitor
 * filling out a short form, and exactly what broke `tests/e2e/tour.spec.ts`
 * (the button reported "intercepting pointer events" was this banner).
 * Reserving the banner's measured height as bottom padding on `#main-content`
 * (the one scroll container every layout shares — see `main.css`) fixes it
 * for all three layouts at once.
 */
const bannerVisible = computed(() => !hasDecided.value && !isSettingsOpen.value)
const bannerEl = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | null = null

function reserveSpace(height: number) {
  document.documentElement.style.setProperty('--cookie-banner-height', height ? `${height + 12}px` : '0px')
}

watch(
  bannerVisible,
  async (visible) => {
    if (visible) {
      document.documentElement.classList.add('has-cookie-banner')
      await nextTick()
      if (!bannerEl.value) return
      resizeObserver ??= new ResizeObserver(() => reserveSpace(bannerEl.value?.offsetHeight ?? 0))
      resizeObserver.observe(bannerEl.value)
      reserveSpace(bannerEl.value.offsetHeight)
    } else {
      resizeObserver?.disconnect()
      document.documentElement.classList.remove('has-cookie-banner')
      reserveSpace(0)
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  document.documentElement.classList.remove('has-cookie-banner')
})
</script>

<template>
  <div>
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-full opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="translate-y-full opacity-0"
    >
      <div v-if="bannerVisible" ref="bannerEl" class="fixed inset-x-0 bottom-0 z-50 p-4 sm:p-6">
        <UCard class="mx-auto max-w-3xl shadow-lg ring ring-default" :ui="{ body: 'sm:py-4' }">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="font-semibold">{{ t('cookieConsent.bannerTitle') }}</h2>
              <p class="text-sm text-muted mt-1">
                {{ t('cookieConsent.bannerBody') }}
                <NuxtLink to="/legal/datenschutz" class="link">{{ t('cookieConsent.privacyLinkText') }}</NuxtLink
                >.
              </p>
            </div>
            <div class="flex flex-wrap gap-2 shrink-0">
              <UButton
                :label="t('cookieConsent.openSettings')"
                color="neutral"
                variant="ghost"
                @click="isSettingsOpen = true"
              />
              <UButton
                :label="t('cookieConsent.acceptNecessary')"
                color="neutral"
                variant="outline"
                @click="acceptNecessaryOnly"
              />
              <UButton :label="t('cookieConsent.acceptAll')" color="primary" @click="acceptAll" />
            </div>
          </div>
        </UCard>
      </div>
    </Transition>

    <UModal v-model:open="isSettingsOpen" :title="t('cookieConsent.settingsTitle')">
      <template #body>
        <div class="space-y-5">
          <p class="text-sm text-muted">
            {{ t('cookieConsent.settingsIntro') }}
            <NuxtLink to="/legal/datenschutz" class="link">{{ t('cookieConsent.privacyLinkText') }}</NuxtLink
            >.
          </p>

          <div>
            <div class="flex items-center justify-between gap-4">
              <span class="text-sm font-medium">{{ t('cookieConsent.categoryNecessaryTitle') }}</span>
              <UBadge
                color="neutral"
                variant="subtle"
                size="sm"
                :label="t('cookieConsent.categoryNecessaryAlwaysOn')"
              />
            </div>
            <p class="mt-1 text-xs text-muted">{{ t('cookieConsent.categoryNecessaryDesc') }}</p>
          </div>

          <USwitch
            v-model="draft.statistics"
            :label="t('cookieConsent.categoryStatisticsTitle')"
            :description="t('cookieConsent.categoryStatisticsDesc')"
          />

          <USwitch
            v-model="draft.marketing"
            :label="t('cookieConsent.categoryMarketingTitle')"
            :description="t('cookieConsent.categoryMarketingDesc')"
          />
        </div>
      </template>

      <template #footer>
        <div class="flex w-full flex-wrap justify-end gap-2">
          <UButton
            :label="t('cookieConsent.acceptNecessary')"
            color="neutral"
            variant="outline"
            @click="acceptNecessaryOnly"
          />
          <UButton :label="t('cookieConsent.save')" color="primary" @click="saveSettings" />
        </div>
      </template>
    </UModal>
  </div>
</template>
