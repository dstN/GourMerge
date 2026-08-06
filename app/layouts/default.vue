<script setup lang="ts">
/**
 * Default Layout — Public-facing app shell with conditional auth state
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
  <div class="flex flex-col h-dvh overflow-hidden bg-default text-default">
    <!-- Skip-to-content for keyboard/screen reader users -->
    <a href="#main-content" class="skip-link">{{ t('a11y.skipToContent') }}</a>

    <!-- ── Header (fixed; only the content area scrolls) ────── -->
    <header class="shrink-0 bg-default border-b border-default">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <!-- Logo / Brand -->
          <NuxtLink to="/" class="flex items-center gap-2.5 group">
            <CommonBrandLogo class="size-7 text-primary transition-opacity group-hover:opacity-80" />
            <span class="text-xl font-bold tracking-tight"> Gour<span class="text-primary">Merge</span> </span>
          </NuxtLink>

          <!-- Desktop navigation — DESIGNBOOK §2.
               Explore is shown to EVERYONE: it is the only public browse surface,
               and gating the whole nav on `loggedIn` left guests with no way to
               reach it from the desktop header at all (the mobile menu did offer
               it, which is how the inconsistency surfaced). -->
          <nav class="hidden md:flex items-center gap-1">
            <UButton
              v-if="loggedIn"
              :label="t('nav.dashboard')"
              color="neutral"
              variant="ghost"
              icon="i-lucide-layout-dashboard"
              to="/dashboard"
            />
            <UButton :label="t('nav.explore')" color="neutral" variant="ghost" icon="i-lucide-compass" to="/explore" />
            <UButton
              v-if="loggedIn"
              :label="t('nav.newRecipe')"
              variant="soft"
              icon="i-lucide-plus"
              to="/recipes/new"
            />
          </nav>

          <!-- Right side -->
          <div class="flex items-center gap-2">
            <div class="hidden md:flex items-center gap-2">
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
    <main id="main-content" tabindex="0" class="flex-1 overflow-y-auto">
      <slot />
    </main>

    <!-- ── Footer (fixed) ──────────────────────────────────── -->
    <footer class="shrink-0 border-t border-default">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div class="flex flex-col-reverse sm:flex-row items-center justify-between gap-2">
          <p class="text-sm text-muted text-center">
            © {{ new Date().getFullYear() }} GourMerge<span class="hidden sm:inline"> — {{ t('app.slogan') }}</span>
          </p>
          <LayoutFooterLinks />
        </div>
      </div>
    </footer>
  </div>
</template>
