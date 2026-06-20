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
  <div class="flex flex-col h-dvh overflow-hidden bg-[var(--ui-bg)] text-[var(--ui-text)]">
    <!-- Skip-to-content for keyboard/screen reader users -->
    <a href="#main-content" class="skip-link">{{ t('a11y.skipToContent') }}</a>

    <!-- ── Header (fixed; only the content area scrolls) ────── -->
    <header class="shrink-0 bg-[var(--ui-bg)] border-b border-[var(--ui-border)]">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <!-- Logo / Brand -->
          <NuxtLink to="/" class="flex items-center gap-2.5 group">
            <CommonBrandLogo class="size-7 text-primary-500 group-hover:text-primary-400 transition-colors" />
            <span class="text-xl font-bold tracking-tight"> Gour<span class="text-primary-500">Merge</span> </span>
          </NuxtLink>

          <!-- Navigation for logged-in users -->
          <nav v-if="loggedIn" class="hidden md:flex items-center gap-1">
            <UButton :label="t('nav.dashboard')" variant="ghost" icon="i-lucide-layout-dashboard" to="/dashboard" />
            <UButton :label="t('nav.explore')" variant="ghost" icon="i-lucide-compass" to="/explore" />
            <UButton
              :label="t('nav.newRecipe')"
              variant="soft"
              icon="i-lucide-plus"
              color="primary"
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
                size="sm"
                class="w-28"
                :aria-label="t('a11y.selectLanguage')"
                @update:model-value="setLocale($event as 'de' | 'en' | 'fr' | 'it')"
              />
              <UColorModeButton />
              <OnboardingHelpMenu />

              <!-- Auth buttons for logged-out users -->
              <template v-if="!loggedIn">
                <UButton :label="t('auth.login')" variant="ghost" to="/auth/login" />
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

    <!-- ── Main Content (the only scrollable region) ───────── -->
    <main id="main-content" tabindex="-1" class="flex-1 overflow-y-auto">
      <slot />
    </main>

    <!-- ── Footer (fixed) ──────────────────────────────────── -->
    <footer class="shrink-0 border-t border-[var(--ui-border)]">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div class="flex flex-col-reverse sm:flex-row items-center justify-between gap-2">
          <p class="text-sm text-[var(--ui-text-muted)] text-center">
            © {{ new Date().getFullYear() }} GourMerge<span class="hidden sm:inline"> — {{ t('app.slogan') }}</span>
          </p>
          <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <UButton
              label="GitHub"
              variant="ghost"
              size="xs"
              icon="i-simple-icons-github"
              to="https://github.com"
              target="_blank"
            />
            <UButton :label="t('legal.impressum')" variant="ghost" size="xs" to="/legal/impressum" />
            <UButton :label="t('legal.datenschutz')" variant="ghost" size="xs" to="/legal/datenschutz" />
            <UButton :label="t('legal.contact')" variant="ghost" size="xs" to="/legal/contact" />
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>
