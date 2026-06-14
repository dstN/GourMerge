<script setup lang="ts">
definePageMeta({ layout: 'auth' })
const { t } = useI18n()
useSeoMeta({ title: () => `${t('auth.verifiedTitle')} — GourMerge`, robots: 'noindex' })
</script>

<template>
  <div class="text-center py-16 space-y-4">
    <UIcon name="i-lucide-circle-check" class="size-16 text-success-500 mx-auto" />
    <h1 class="text-2xl font-bold">{{ t('auth.verifiedTitle') }}</h1>
    <p class="text-[var(--ui-text-muted)]">{{ t('auth.verifiedMessage') }}</p>
    <UButton :label="t('auth.login')" to="/auth/login" />
  </div>
</template>
