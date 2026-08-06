<script setup lang="ts">
definePageMeta({ layout: 'auth' })
const { t } = useI18n()
useSeoMeta({ title: () => `${t('auth.verifiedTitle')} — GourMerge`, robots: 'noindex' })
</script>

<template>
  <UCard>
    <div class="text-center py-6 space-y-4">
      <UIcon name="i-lucide-circle-check" class="size-12 text-success-500 mx-auto" aria-hidden="true" />
      <h1 class="text-2xl font-bold">{{ t('auth.verifiedTitle') }}</h1>
      <p class="text-muted">{{ t('auth.verifiedMessage') }}</p>
      <UButton :label="t('auth.login')" icon="i-lucide-log-in" to="/auth/login" />
    </div>
  </UCard>
</template>
