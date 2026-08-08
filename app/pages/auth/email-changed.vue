<script setup lang="ts">
definePageMeta({ layout: 'auth' })
const { t } = useI18n()
useSeoMeta({ title: () => `${t('auth.emailChangedTitle')}: GourMerge`, robots: 'noindex' })
</script>

<template>
  <UCard>
    <div class="text-center py-6 space-y-4">
      <UIcon name="i-lucide-circle-check" class="size-12 text-success-500 mx-auto" aria-hidden="true" />
      <h1 class="text-2xl font-bold">{{ t('auth.emailChangedTitle') }}</h1>
      <p class="text-muted">{{ t('auth.emailChangedMessage') }}</p>
      <UButton :label="t('nav.dashboard')" icon="i-lucide-layout-dashboard" to="/dashboard" />
    </div>
  </UCard>
</template>
