<script setup lang="ts">
/**
 * Login Page — Authenticate existing users
 */
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth', middleware: 'guest' })

const { t } = useI18n()
const { fetch: fetchSession } = useUserSession()

useSeoMeta({
  title: `${t('auth.login')} — GourMerge`,
})

const loading = ref(false)
const error = ref('')

const schema = z.object({
  email: z.string().email(t('auth.emailInvalid')),
  password: z.string().min(1, t('auth.passwordRequired')),
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  email: '',
  password: '',
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  error.value = ''

  try {
    await $fetch('/auth/login', {
      method: 'POST',
      body: event.data,
    })
    await fetchSession()
    navigateTo('/dashboard')
  }
  catch (err: unknown) {
    error.value = (err as { data?: { statusMessage?: string } })?.data?.statusMessage || t('auth.loginError')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <h1 class="text-2xl font-bold text-center">
        {{ t('auth.login') }}
      </h1>
      <p class="text-sm text-[var(--ui-text-muted)] text-center mt-1">
        {{ t('auth.loginSubtitle') }}
      </p>
    </template>

    <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
      <!-- Error alert -->
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-alert-circle"
        :title="error"
        :close-button="{ onClick: () => error = '' }"
      />

      <UFormField :label="t('auth.email')" name="email" required>
        <UInput
          v-model="state.email"
          type="email"
          :placeholder="t('auth.emailPlaceholder')"
          icon="i-lucide-mail"
          size="lg"
        />
      </UFormField>

      <UFormField :label="t('auth.password')" name="password" required>
        <UInput
          v-model="state.password"
          type="password"
          :placeholder="t('auth.passwordPlaceholder')"
          icon="i-lucide-lock"
          size="lg"
        />
      </UFormField>

      <UButton
        type="submit"
        :label="t('auth.loginButton')"
        icon="i-lucide-log-in"
        size="lg"
        block
        :loading="loading"
      />
    </UForm>

    <template #footer>
      <div class="space-y-2 text-center text-sm text-[var(--ui-text-muted)]">
        <p>
          {{ t('auth.noAccount') }}
          <NuxtLink to="/auth/register" class="text-primary-500 font-medium hover:underline">
            {{ t('auth.registerLink') }}
          </NuxtLink>
        </p>
        <p>
          <NuxtLink to="/auth/forgot-password" class="text-[var(--ui-text-muted)] hover:text-primary-500 hover:underline text-xs">
            {{ t('auth.forgotPassword') }}
          </NuxtLink>
        </p>
      </div>
    </template>
  </UCard>
</template>
