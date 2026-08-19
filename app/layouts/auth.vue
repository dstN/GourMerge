<script setup lang="ts">
/**
 * Auth Layout — minimal centred shell for login/register/reset.
 *
 * Uses the same app shell as `default`/`dashboard` (DESIGNBOOK §4.1): `h-dvh`,
 * `overflow-hidden`, and only `<main>` scrolls. It previously used `min-h-screen`
 * on the outer div, which double-scrolls on mobile once the browser chrome is
 * counted. The inner flex row keeps the card centred when it fits and lets it
 * scroll when it doesn't (the register form is taller than a short viewport) —
 * see the note at `<main>` for why that row is `flex-1` rather than `min-h-full`.
 *
 * The `max-w-md` cap lives HERE, not on the pages — see the note in
 * `forgot-password.vue`'s history: two pages used to cap and offset their own
 * card, so they rendered 64px lower and narrower than login.
 */
const { t } = useI18n()
</script>

<template>
  <div class="flex flex-col h-dvh overflow-hidden bg-default text-default">
    <a href="#main-content" class="skip-link">{{ t('a11y.skipToContent') }}</a>

    <!-- `flex flex-col` so the cookie banner below can claim its own space as a
         `shrink-0` sibling instead of overlapping the centred card — see the note
         in `LegalCookieConsent`. The card wrapper takes whatever is left via
         `flex-1` (replacing the old `min-h-full`, which sized against `<main>`
         itself and left no room for a second flex child). -->
    <main id="main-content" tabindex="0" class="flex flex-1 flex-col overflow-y-auto">
      <div class="flex flex-1 items-center justify-center px-4 py-10">
        <div class="w-full max-w-md">
          <!-- Brand -->
          <div class="text-center mb-8">
            <NuxtLink to="/" class="inline-flex items-center gap-2.5 group">
              <CommonBrandLogo class="size-10 text-primary transition-opacity group-hover:opacity-80" />
              <span class="text-3xl font-bold tracking-tight"> Gour<span class="text-primary">Merge</span> </span>
            </NuxtLink>
          </div>

          <slot />

          <!-- Footer -->
          <div class="mt-8 flex flex-col items-center gap-2">
            <p class="text-center text-sm text-dimmed">© {{ new Date().getFullYear() }} GourMerge</p>
            <LayoutFooterLinks />
          </div>
        </div>
      </div>
      <LegalCookieConsent />
    </main>
  </div>
</template>
