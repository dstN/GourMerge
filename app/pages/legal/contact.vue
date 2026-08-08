<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'default' })

const { t } = useI18n()
const toast = useAppToast()

useSeoMeta({
  title: `${t('legal.contactTitle')}: GourMerge`,
})

const schema = z.object({
  name: z
    .string()
    .min(2, t('validation.tooShort', { min: 2 }))
    .max(100, t('validation.tooLong', { max: 100 })),
  email: z.string().email(t('auth.emailInvalid')),
  message: z
    .string()
    .min(10, t('validation.tooShort', { min: 10 }))
    .max(2000, t('validation.tooLong', { max: 2000 })),
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  name: '',
  email: '',
  message: '',
})

const honeypot = ref('')
const loading = ref(false)
const success = ref(false)

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  success.value = false

  try {
    await $fetch('/api/contact', {
      method: 'POST',
      body: { ...event.data, honeypot: honeypot.value },
    })
    success.value = true
    state.name = ''
    state.email = ''
    state.message = ''
    honeypot.value = ''
  } catch {
    toast.error(t('legal.contactError'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <CommonPageShell width="form">
    <UCard>
      <template #header>
        <h1 class="text-2xl font-bold">
          {{ t('legal.contactTitle') }}
        </h1>
        <p class="text-sm text-muted mt-1">
          {{ t('legal.contactSubtitle') }}
        </p>
      </template>

      <!-- Success state -->
      <UAlert
        v-if="success"
        color="success"
        icon="i-lucide-check-circle"
        :title="t('legal.contactSuccess')"
        class="mb-4"
      />

      <UForm v-else :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <!-- Honeypot (hidden from real users) -->
        <input v-model="honeypot" name="website" class="hidden" tabindex="-1" autocomplete="off" />

        <UFormField :label="t('legal.contactName')" name="name" required>
          <UInput v-model="state.name" :placeholder="t('legal.contactNamePlaceholder')" icon="i-lucide-user" />
        </UFormField>

        <UFormField :label="t('legal.contactEmail')" name="email" required>
          <UInput
            v-model="state.email"
            type="email"
            :placeholder="t('legal.contactEmailPlaceholder')"
            icon="i-lucide-mail"
          />
        </UFormField>

        <UFormField :label="t('legal.contactMessage')" name="message" required>
          <UTextarea v-model="state.message" :placeholder="t('legal.contactMessagePlaceholder')" :rows="6" />
        </UFormField>

        <UButton
          type="submit"
          :label="t('legal.contactSend')"
          icon="i-lucide-send"
          size="lg"
          block
          :loading="loading"
        />
      </UForm>
    </UCard>
  </CommonPageShell>
</template>
