<script setup lang="ts">
/**
 * Dashboard Layout — the signed-in shell.
 *
 * ## There is no sidebar any more, and that is the point
 *
 * This layout used to carry a 256px `<aside>` whose four links (Dashboard, Meine Rezepte,
 * Favoriten, Entdecken) were *also* in the header nav and *also* in the user dropdown, and
 * whose two "quick actions" (Neues Rezept, Einstellungen) were likewise duplicated in both.
 * Fifteen entries for nine destinations, and no rule anyone could infer about which copy to
 * use.
 *
 * Removing it fixes a second thing at the same time. With a sidebar, the header is centred
 * in the *window* while the content column starts after the sidebar, so the logo and the
 * content it sits above never line up — the previous attempt at that alignment needed a
 * documented block of magic numbers in `main.css` plus an E2E test pinning them, and still
 * only worked from `lg` up. Without it, both the header and the content are the same
 * `max-w-7xl` container centred in the same viewport, and they line up by construction, at
 * every width, with no CSS at all. That is exactly what the logged-out `/explore` state was
 * already doing right.
 *
 * What remains layout-specific is the email-verification banner, which is why this is still
 * a separate layout from `default` rather than the two being merged.
 *
 * Navigation now lives in exactly two places, each with a distinct job: `<LayoutMainNav>`
 * for destinations you move between while working, and `<LayoutUserDropdown>` for
 * everything about *your* account. Below `lg`, `<LayoutMobileMenu>` carries both.
 */
const { t, locale, setLocale } = useI18n()
// Explicit, not implicit: see the note in `default.vue`. A link's locale must not depend on
// whether its target happens to be written as a literal.
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
  <div class="print-shell flex flex-col h-dvh overflow-hidden bg-default text-default">
    <!-- Skip-to-content for keyboard/screen reader users -->
    <a href="#main-content" class="skip-link">{{ t('a11y.skipToContent') }}</a>

    <!-- ── Header (fixed) ──────────────────────────────────────
         Same `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` container as <CommonPageShell>'s
         `wide`, so the logo and the page content below share one left edge. -->
    <header class="shrink-0 bg-default border-b border-default">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16 gap-2">
          <!-- Logo -->
          <NuxtLink :to="localePath('/dashboard')" class="flex items-center gap-2.5 group shrink-0">
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
              <LayoutUserDropdown v-if="loggedIn" />
            </div>

            <!-- Mobile: hamburger → offcanvas with everything -->
            <LayoutMobileMenu />
          </div>
        </div>
      </div>
    </header>

    <!-- Sits outside <main> so it survives page navigation and is not scrolled away:
         the restriction it describes applies to the whole authenticated shell, not to
         one page. Renders nothing when the address is verified or the gate is off. -->
    <LayoutVerifyEmailBanner class="shrink-0" />

    <!-- ── Main Content (the only scrollable region) ─────────
         A bare scroll container — DESIGNBOOK §4.1. The page's own <CommonPageShell>
         owns the cap and the gutters, and because those match the header's container
         exactly, content and chrome align without any layout CSS here.

         `tabindex="0"`, not `-1`: <main> is the ONLY scroll container in this shell, so
         it has to be reachable by keyboard or the content cannot be scrolled without a
         mouse (axe: `scrollable-region-focusable`). -->
    <!-- `data-shell` is the only thing in the DOM that names which shell rendered. All
         three layouts use `#main-content`, so that id cannot tell them apart, and the
         email-verification banner — the one remaining behavioural difference — renders
         nothing unless the gate is on. `tests/e2e/shell.spec.ts` asserts against this. -->
    <main id="main-content" data-shell="app" tabindex="0" class="flex-1 overflow-y-auto">
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
