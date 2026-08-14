<script setup lang="ts">
/**
 * /offline — the PWA's precached navigation fallback (see `nuxt.config.ts`'s
 * `navigateFallback` and `routeRules['/offline']`).
 *
 * Deliberately static: no data fetching, no `useFetch`, nothing that assumes a network —
 * it has to render correctly from Workbox's precache with zero connectivity, which is the
 * one condition every other page in this app is allowed to assume away.
 *
 * Deliberately NOT using `useI18n()` either, even though every other page is fully
 * localized. `navigateFallback` is a single URL — Workbox has no way to serve a different
 * precached page per locale — so this one page is shown regardless of which of the four
 * locale-prefixed routes the visitor was actually on when they went offline (`strategy:
 * 'prefix_except_default'` means `/en/...`, `/fr/...`, `/it/...` all exist, but only the
 * bare `/offline` is prerendered and precached). Hardcoding DE + EN side by side, rather
 * than pretending this integrates with the locale system, is the honest choice for a page
 * only ever seen in a rare edge case.
 */
definePageMeta({ layout: false })
</script>

<template>
  <div class="flex h-dvh flex-col items-center justify-center gap-6 bg-default px-6 text-center text-default">
    <UIcon name="i-lucide-wifi-off" class="size-12 text-dimmed" aria-hidden="true" />
    <div class="space-y-1">
      <p class="text-lg font-semibold">Keine Internetverbindung</p>
      <p class="text-sm text-muted">Diese Seite ist offline nicht verfügbar. Bitte versuche es erneut.</p>
    </div>
    <div class="space-y-1">
      <p class="text-lg font-semibold">No internet connection</p>
      <p class="text-sm text-muted">This page isn't available offline. Please try again.</p>
    </div>
    <UButton label="Neu laden / Reload" icon="i-lucide-refresh-cw" @click="() => location.reload()" />
  </div>
</template>
