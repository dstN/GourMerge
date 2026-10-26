<script setup lang="ts">
// Signed-in visitors redirect via the `guest` middleware, not navigateTo() here — middleware
// resolves before render, so there's no flash of this page first.
definePageMeta({ middleware: 'guest' })

const { t } = useI18n()

useSeoMeta({
  // Page-level useSeoMeta overrides app.vue's site-wide default, so this must be translated too.
  title: () => `GourMerge: ${t('app.slogan')}`,
  description: () => t('seo.description'),
})

/**
 * Everything below the hero is a lazily hydrated component — see each one in
 * `components/landing/`. The page is server-rendered in full either way; what changes is how
 * much of it the browser walks again after the JavaScript arrives. Lighthouse mobile measured
 * that walk as one ~530 ms task (4× CPU throttle), and Total Blocking Time carries 30 % of the
 * performance score. The feature grid and the step list are static text, so they are never
 * hydrated; the closing call to action has a button and hydrates when scrolled into view. The
 * hero stays hydrated: it is on screen first and its two buttons should navigate client-side.
 */
</script>

<template>
  <div>
    <!-- DESIGNBOOK §1.4 exception: display hero for marketing copy. Sections are full-bleed
         (background tints), each wrapped in a spacing="none" shell. -->
    <!-- ── Hero Section ──────────────────────────────────── -->
    <section class="relative overflow-hidden py-20 sm:py-32">
      <!-- Background gradient -->
      <div
        class="absolute inset-0 bg-linear-to-br from-primary-500/5 via-transparent to-secondary-500/5 pointer-events-none"
      />

      <CommonPageShell width="content" spacing="none" class="relative text-center">
        <div
          class="inline-flex items-center gap-2 bg-primary-500/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-6"
        >
          <UIcon name="i-lucide-sparkles" class="size-4" aria-hidden="true" />
          {{ t('landing.badge') }}
        </div>

        <h1 class="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6">
          Gour<span class="text-primary">Merge</span>
        </h1>

        <p class="text-2xl sm:text-3xl text-muted font-light mb-10">
          {{ t('app.slogan') }}
        </p>

        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <UButton :label="t('landing.getStarted')" icon="i-lucide-chef-hat" size="lg" to="/auth/register" />
          <UButton
            :label="t('landing.learnMore')"
            icon="i-lucide-book-marked"
            size="lg"
            color="neutral"
            variant="subtle"
            to="/help/glossary"
          />
        </div>
      </CommonPageShell>
    </section>

    <LazyLandingFeatures hydrate-never />
    <LazyLandingSteps hydrate-never />
    <LazyLandingCta hydrate-on-visible />
  </div>
</template>
