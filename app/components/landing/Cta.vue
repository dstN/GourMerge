<script setup lang="ts">
/**
 * The closing call to action. Rendered with `hydrate-on-visible` from `pages/index.vue`: it
 * holds a button, so it does need its JavaScript for client-side navigation — but only once it
 * has been scrolled to, which on a phone is three screens below the first paint.
 */
const { t } = useI18n()
</script>

<template>
  <section class="py-20">
    <CommonPageShell width="content" spacing="none" class="text-center">
      <CommonBrandLogo class="size-16 text-primary mx-auto mb-6" />
      <h2 class="text-3xl sm:text-4xl font-bold mb-4">
        {{ t('landing.ctaTitle') }}
      </h2>
      <p class="text-lg text-muted mb-8">
        {{ t('landing.ctaSubtitle') }}
      </p>
      <UButton :label="t('landing.getStarted')" icon="i-lucide-arrow-right" size="lg" to="/auth/register" />
    </CommonPageShell>
  </section>
</template>
