<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const route = useRoute()
const toast = useAppToast()

const token = computed(() => route.query.token as string | undefined)
const password = ref('')
const password2 = ref('')
const pending = ref(false)
const done = ref(false)

useSeoMeta({ title: () => `${t('auth.resetPassword')} — GourMerge`, robots: 'noindex' })

const mismatch = computed(() => password.value && password2.value && password.value !== password2.value)

async function submit() {
  if (!token.value || mismatch.value) return
  pending.value = true
  try {
    await $fetch('/auth/reset-password', { method: 'POST', body: { token: token.value, password: password.value } })
    done.value = true
  } catch (e: unknown) {
    toast.error((e as { data?: { statusMessage?: string } })?.data?.statusMessage || t('auth.resetPasswordError'))
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UCard class="max-w-md mx-auto mt-16">
    <template #header>
      <h1 class="text-xl font-bold">{{ t('auth.resetPassword') }}</h1>
    </template>

    <div v-if="!token" class="text-center py-8">
      <p class="text-error-500">{{ t('auth.resetTokenMissing') }}</p>
      <UButton :label="t('auth.forgotPassword')" to="/auth/forgot-password" class="mt-4" />
    </div>

    <div v-else-if="done" class="text-center space-y-3 py-4">
      <UIcon name="i-lucide-check-circle" class="size-12 text-success-500 mx-auto" />
      <p>{{ t('auth.resetPasswordDone') }}</p>
      <UButton :label="t('auth.login')" to="/auth/login" />
    </div>

    <form v-else class="space-y-4" @submit.prevent="submit">
      <UFormField :label="t('auth.newPassword')">
        <UInput v-model="password" type="password" autocomplete="new-password" required minlength="8" />
      </UFormField>
      <UFormField :label="t('auth.confirmPassword')" :error="mismatch ? t('auth.passwordMismatch') : undefined">
        <UInput v-model="password2" type="password" autocomplete="new-password" required />
      </UFormField>
      <UButton type="submit" :label="t('auth.setNewPassword')" :loading="pending" :disabled="!!mismatch" block />
    </form>
  </UCard>
</template>
