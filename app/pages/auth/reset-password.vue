<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const { apiError } = useApiError()
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
    toast.error(apiError(e, 'auth.resetPasswordError'))
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <!-- Cap + centring come from the auth layout (DESIGNBOOK §4.1). -->
  <UCard>
    <template #header>
      <h1 class="text-2xl font-bold text-center">{{ t('auth.resetPassword') }}</h1>
    </template>

    <div v-if="!token" class="text-center py-8 space-y-4">
      <p class="text-error-500">{{ t('auth.resetTokenMissing') }}</p>
      <UButton :label="t('auth.forgotPassword')" to="/auth/forgot-password" />
    </div>

    <div v-else-if="done" class="text-center space-y-3 py-4">
      <UIcon name="i-lucide-check-circle" class="size-12 text-success-500 mx-auto" aria-hidden="true" />
      <p>{{ t('auth.resetPasswordDone') }}</p>
      <UButton :label="t('auth.login')" to="/auth/login" />
    </div>

    <form v-else class="space-y-4" @submit.prevent="submit">
      <UFormField :label="t('auth.newPassword')" required>
        <UInput
          v-model="password"
          type="password"
          autocomplete="new-password"
          icon="i-lucide-lock"
          required
          minlength="8"
        />
      </UFormField>
      <UFormField
        :label="t('auth.confirmPassword')"
        :error="mismatch ? t('auth.passwordMismatch') : undefined"
        required
      >
        <UInput v-model="password2" type="password" autocomplete="new-password" icon="i-lucide-lock" required />
      </UFormField>
      <UButton
        type="submit"
        :label="t('auth.setNewPassword')"
        icon="i-lucide-key-round"
        size="lg"
        block
        :loading="pending"
        :disabled="!!mismatch"
      />
    </form>
  </UCard>
</template>
