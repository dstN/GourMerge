<script setup lang="ts">
/**
 * Default Layout — Public-facing app shell with conditional auth state
 */

const { t, locale, setLocale } = useI18n()
const { loggedIn, user } = useUserSession()

const localeSwitchItems = [
  { label: 'Deutsch', value: 'de' },
  { label: 'English', value: 'en' },
]
</script>

<template>
  <div class="min-h-screen bg-[var(--ui-bg)] text-[var(--ui-text)]">
    <!-- Skip-to-content for keyboard/screen reader users -->
    <a href="#main-content" class="skip-link">{{ t('a11y.skipToContent') }}</a>

    <!-- ── Header ──────────────────────────────────────────── -->
    <header class="sticky top-0 z-50 backdrop-blur-xl bg-[var(--ui-bg)]/80 border-b border-[var(--ui-border)]">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <!-- Logo / Brand -->
          <NuxtLink to="/" class="flex items-center gap-2.5 group">
            <UIcon
              name="i-lucide-chef-hat"
              class="size-7 text-primary-500 group-hover:text-primary-400 transition-colors"
            />
            <span class="text-xl font-bold tracking-tight">
              Gour<span class="text-primary-500">Merge</span>
            </span>
          </NuxtLink>

          <!-- Navigation for logged-in users -->
          <nav v-if="loggedIn" class="hidden md:flex items-center gap-1">
            <UButton
              :label="t('nav.dashboard')"
              variant="ghost"
              icon="i-lucide-layout-dashboard"
              to="/dashboard"
            />
            <UButton
              :label="t('nav.explore')"
              variant="ghost"
              icon="i-lucide-compass"
              to="/"
              data-tour="nav-explore"
            />
            <UButton
              :label="t('nav.newRecipe')"
              variant="soft"
              icon="i-lucide-plus"
              color="primary"
              to="/recipes/new"
              data-tour="new-recipe-btn"
            />
          </nav>

          <!-- Right side -->
          <div class="flex items-center gap-2">
            <USelect
              :model-value="locale"
              :items="localeSwitchItems"
              value-key="value"
              size="sm"
              class="w-28"
              @update:model-value="setLocale($event as string)"
            />
            <UColorModeButton />
            <OnboardingHelpMenu />

            <!-- Auth buttons for logged-out users -->
            <template v-if="!loggedIn">
              <UButton
                :label="t('auth.login')"
                variant="ghost"
                to="/auth/login"
              />
              <UButton
                :label="t('auth.register')"
                to="/auth/register"
              />
            </template>

            <!-- User dropdown for logged-in users -->
            <LayoutUserDropdown v-else />
          </div>
        </div>
      </div>
    </header>

    <!-- ── Main Content ────────────────────────────────────── -->
    <main id="main-content" tabindex="-1">
      <slot />
    </main>

    <!-- ── Onboarding overlays (client-only, non-blocking) ── -->
    <ClientOnly>
      <OnboardingConceptIntro />
      <OnboardingTourOverlay />
    </ClientOnly>

    <!-- ── Footer ──────────────────────────────────────────── -->
    <footer class="border-t border-[var(--ui-border)] mt-auto">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p class="text-sm text-[var(--ui-text-muted)]">
            © {{ new Date().getFullYear() }} GourMerge — {{ t('app.sloganDe') }}
          </p>
          <div class="flex items-center gap-4">
            <UButton
              label="GitHub"
              variant="ghost"
              size="xs"
              icon="i-simple-icons-github"
              to="https://github.com"
              target="_blank"
            />
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>
