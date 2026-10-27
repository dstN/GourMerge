<script setup lang="ts">
/**
 * The right-hand cluster of the public header: language select, colour mode, help menu, the
 * sign-in/register pair (or the account dropdown), and the mobile hamburger.
 *
 * Extracted from `layouts/default.vue` so the layout can render it with `hydrate-on-idle`.
 * The select and the slideover are the two most component-heavy things on the landing page —
 * Reka UI composes each from a dozen parts — and nothing here is needed in the first frame:
 * the markup is server-rendered and looks final, the controls merely do not respond until the
 * idle callback fires a few milliseconds after mount. Hydrating them in that callback takes
 * them out of the one long task that Lighthouse scores as Total Blocking Time.
 */
const { t, locale, setLocale } = useI18n()
const { loggedIn } = useUserSession()

const localeSwitchItems = [
  { label: 'Deutsch', value: 'de' },
  { label: 'English', value: 'en' },
  { label: 'Français', value: 'fr' },
  { label: 'Italiano', value: 'it' },
]
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- Same breakpoint as <LayoutMainNav> and <LayoutMobileMenu>: below lg there is not
         room for the nav AND this cluster, and the shell clips rather than scrolls.
         See the note in MainNav.vue. -->
    <div class="hidden lg:flex items-center gap-2">
      <USelect
        :model-value="locale"
        :items="localeSwitchItems"
        value-key="value"
        class="w-28"
        :aria-label="t('a11y.selectLanguage')"
        @update:model-value="setLocale($event as 'de' | 'en' | 'fr' | 'it')"
      />
      <UColorModeButton />
      <OnboardingHelpMenu />

      <!-- Auth buttons for logged-out users -->
      <template v-if="!loggedIn">
        <UButton :label="t('auth.login')" color="neutral" variant="subtle" to="/auth/login" />
        <UButton :label="t('auth.register')" to="/auth/register" />
      </template>

      <!-- User dropdown for logged-in users -->
      <LayoutUserDropdown v-else />
    </div>

    <!-- Mobile: hamburger → offcanvas with everything -->
    <LayoutMobileMenu />
  </div>
</template>
