<script setup lang="ts">
/**
 * Default Layout — Public-facing app shell with conditional auth state
 */

const { t, locale, setLocale } = useI18n()
/**
 * The logo's target is a runtime expression, and that is exactly why it needs this.
 * i18n localises a NuxtLink whose `to` is a static literal (`to="/explore"` renders as
 * `/en/explore`), but it cannot rewrite a ternary evaluated at runtime — so the logo kept
 * navigating to the UNPREFIXED path, which under `prefix_except_default` IS German.
 * Reported symptom: pick French, browse, click the logo, and the site is German again.
 */
const localePath = useLocalePath()
const { loggedIn } = useUserSession()

const localeSwitchItems = [
  { label: 'Deutsch', value: 'de' },
  { label: 'English', value: 'en' },
  { label: 'Français', value: 'fr' },
  { label: 'Italiano', value: 'it' },
]
</script>

<template>
  <div class="flex flex-col h-dvh overflow-hidden bg-default text-default">
    <!-- Skip-to-content for keyboard/screen reader users -->
    <a href="#main-content" class="skip-link">{{ t('a11y.skipToContent') }}</a>

    <!-- ── Header (fixed; only the content area scrolls) ────── -->
    <header class="shrink-0 bg-default border-b border-default">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <!-- Logo / Brand.
               Points at the dashboard when signed in. The `guest` middleware on `/`
               would bounce them there anyway, but sending them straight there avoids a
               wasted navigation — and makes the link's href honest, so the status bar
               shows where the click actually goes. -->
          <NuxtLink :to="localePath(loggedIn ? '/dashboard' : '/')" class="flex items-center gap-2.5 group">
            <CommonBrandLogo class="size-7 text-primary transition-opacity group-hover:opacity-80" />
            <span class="text-xl font-bold tracking-tight"> Gour<span class="text-primary">Merge</span> </span>
          </NuxtLink>

          <LayoutMainNav />

          <!-- Right side -->
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
        </div>
      </div>
    </header>

    <!-- ── Main Content (the only scrollable region) ─────────
         `tabindex="0"`, not `-1`: in this shell <main> is the ONLY scroll
         container, so it has to be reachable by keyboard or the content cannot be
         scrolled without a mouse. axe caught this as `scrollable-region-focusable`
         on /help/glossary — the one page whose content holds nothing focusable, so
         the region had no other way in. The skip-link still works either way. -->
    <!-- See the note on the same attribute in `dashboard.vue`: it is what tells the two
         shells apart in the DOM, for `tests/e2e/shell.spec.ts`. -->
    <main id="main-content" data-shell="public" tabindex="0" class="flex-1 overflow-y-auto">
      <slot />
    </main>

    <!-- ── Footer (fixed) ──────────────────────────────────── -->
    <footer class="shrink-0 border-t border-default">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div class="flex flex-col-reverse sm:flex-row items-center justify-between gap-2">
          <p class="text-sm text-muted text-center">
            © {{ new Date().getFullYear() }} GourMerge<span class="hidden sm:inline">: {{ t('app.slogan') }}</span>
          </p>
          <LayoutFooterLinks />
        </div>
      </div>
    </footer>
  </div>
</template>
