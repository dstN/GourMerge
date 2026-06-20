<script setup lang="ts">
// Set <html lang> to the active locale so screen readers announce the correct
// language (WCAG 3.1.1). Reactive so it updates on locale switch.
const { locale } = useI18n()
useHead({
  htmlAttrs: { lang: computed(() => locale.value) },
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>

    <!-- Onboarding overlays — mounted globally so they work in every layout -->
    <ClientOnly>
      <OnboardingConceptIntro />
      <OnboardingTourOverlay />
    </ClientOnly>
  </UApp>
</template>
