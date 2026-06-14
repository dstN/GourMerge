<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const toast = useAppToast()

const email = ref('')
const pending = ref(false)
const sent = ref(false)

useSeoMeta({ title: () => `${t('auth.forgotPassword')} — GourMerge`, robots: 'noindex' })

async function submit() {
  if (!email.value) return
  pending.value = true
  try {
    await $fetch('/auth/forgot-password', { method: 'POST', body: { email: email.value } })
    sent.value = true
  } catch {
    toast.error(t('auth.forgotPasswordError'))
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UCard class="max-w-md mx-auto mt-16">
    <template #header>
      <h1 class="text-xl font-bold">{{ t('auth.forgotPassword') }}</h1>
    </template>

    <div v-if="sent" class="text-center space-y-3 py-4">
      <UIcon name="i-lucide-mail-check" class="size-12 text-success-500 mx-auto" />
      <p class="text-[var(--ui-text-muted)]">{{ t('auth.forgotPasswordSent') }}</p>
    </div>

    <form v-else class="space-y-4" @submit.prevent="submit">
      <UFormField :label="t('auth.email')">
        <UInput
          v-model="email"
          type="email"
          autocomplete="email"
          :placeholder="t('auth.emailPlaceholder')"
          required
        />
      </UFormField>
      <UButton type="submit" :label="t('auth.sendResetLink')" :loading="pending" block />
      <p class="text-center text-sm text-[var(--ui-text-muted)]">
        <NuxtLink to="/auth/login" class="text-primary-500 hover:underline">{{ t('auth.backToLogin') }}</NuxtLink>
      </p>
    </form>
  </UCard>
</template>
