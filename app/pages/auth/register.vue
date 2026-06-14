<script setup lang="ts">
/**
 * Register Page — Create a new account
 */
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth', middleware: 'guest' })

const { t } = useI18n()
const { fetch: fetchSession } = useUserSession()

useSeoMeta({
  title: `${t('auth.register')} — GourMerge`,
})

const loading = ref(false)
const error = ref('')

const schema = z.object({
  username: z
    .string()
    .min(3, t('auth.usernameMin'))
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/, t('auth.usernameFormat')),
  email: z.string().email(t('auth.emailInvalid')),
  password: z.string().min(8, t('auth.passwordMin')),
  displayName: z.string().max(100).optional(),
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  username: '',
  email: '',
  password: '',
  displayName: '',
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  error.value = ''

  try {
    await $fetch('/auth/register', {
      method: 'POST',
      body: event.data,
    })
    await fetchSession()
    navigateTo('/dashboard')
  }
  catch (err: unknown) {
    error.value = (err as { data?: { statusMessage?: string } })?.data?.statusMessage || t('auth.registerError')
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
        {{ t('auth.register') }}
      </h1>
      <p class="text-sm text-[var(--ui-text-muted)] text-center mt-1">
        {{ t('auth.registerSubtitle') }}
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

      <UFormField :label="t('auth.displayName')" name="displayName">
        <UInput
          v-model="state.displayName"
          :placeholder="t('auth.displayNamePlaceholder')"
          icon="i-lucide-user"
          size="lg"
        />
      </UFormField>

      <UFormField :label="t('auth.username')" name="username" required>
        <UInput
          v-model="state.username"
          :placeholder="t('auth.usernamePlaceholder')"
          icon="i-lucide-at-sign"
          size="lg"
        />
      </UFormField>

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
        :label="t('auth.registerButton')"
        icon="i-lucide-user-plus"
        size="lg"
        block
        :loading="loading"
      />
    </UForm>

    <template #footer>
      <p class="text-sm text-center text-[var(--ui-text-muted)]">
        {{ t('auth.hasAccount') }}
        <NuxtLink to="/auth/login" class="text-primary-500 font-medium hover:underline">
          {{ t('auth.loginLink') }}
        </NuxtLink>
      </p>
    </template>
  </UCard>
</template>
