<script setup lang="ts">
/**
 * Dashboard Layout — Authenticated layout with sidebar and user header
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

    <!-- ── Header (fixed) ──────────────────────────────────── -->
    <header class="shrink-0 bg-default border-b border-default">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <!-- Logo -->
          <NuxtLink to="/dashboard" class="flex items-center gap-2.5 group">
            <CommonBrandLogo class="size-7 text-primary transition-opacity group-hover:opacity-80" />
            <span class="text-xl font-bold tracking-tight"> Gour<span class="text-primary">Merge</span> </span>
          </NuxtLink>

          <!-- Center nav — DESIGNBOOK §2: idle nav is neutral/ghost, the
               emphasised action is primary/soft -->
          <nav class="hidden md:flex items-center gap-1">
            <UButton
              :label="t('nav.dashboard')"
              color="neutral"
              variant="ghost"
              icon="i-lucide-layout-dashboard"
              to="/dashboard"
            />
            <UButton
              :label="t('nav.myRecipes')"
              color="neutral"
              variant="ghost"
              icon="i-lucide-book-open"
              to="/recipes"
            />
            <UButton :label="t('nav.explore')" color="neutral" variant="ghost" icon="i-lucide-compass" to="/explore" />
            <UButton :label="t('nav.newRecipe')" variant="soft" icon="i-lucide-plus" to="/recipes/new" />
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
              <LayoutUserDropdown v-if="loggedIn" />
            </div>

            <!-- Mobile: hamburger → offcanvas with everything -->
            <LayoutMobileMenu />
          </div>
        </div>
      </div>
    </header>

    <!-- ── Body (fixed sidebar; only main scrolls) ───────────
         Full width so the sidebar sits at the left edge and main's scrollbar
         sits at the viewport's right edge; content is capped + centred INSIDE
         main by the page's own <CommonPageShell> (capping the row would push the
         scrollbar into mid-page).

         <main> is a BARE scroll container — DESIGNBOOK §4.1. It used to add its
         own `max-w-screen-2xl px-4 … py-8` wrapper, which then fought the page's
         own cap and doubled the padding on every dashboard page. -->
    <div class="flex-1 flex min-h-0 overflow-hidden">
      <!-- Sidebar (fixed; scrolls independently if it overflows) -->
      <aside class="hidden lg:block w-64 shrink-0 border-r border-default overflow-y-auto">
        <LayoutDashboardSidebar />
      </aside>

      <!-- Main content (the only scrollable region) -->
      <!-- `data-shell="sidebar"` tells the page shell to align its cap left instead of
           centring it. All three layouts use `#main-content`, so that id cannot
           distinguish them; this attribute can. -->
      <!-- `scrollbar-gutter-stable` is what makes the content column line up with the
           header at all. The header is centred in the WINDOW; this region scrolls, so
           without a reserved gutter its width changes the moment content overflows, the
           column shifts by half a scrollbar and the alignment drifts per page. -->
      <main
        id="main-content"
        data-shell="sidebar"
        tabindex="0"
        class="flex-1 overflow-y-auto [scrollbar-gutter:stable]"
      >
        <slot />
      </main>
    </div>

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
