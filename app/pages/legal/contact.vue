<script setup lang="ts">
/**
 * Contact Page — Contact form with rate-limited backend
 */
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'default' })

const { t } = useI18n()
const toast = useToast()

useSeoMeta({
  title: `${t('legal.contactTitle')} — GourMerge`,
})

const schema = z.object({
  name: z.string().min(2, t('legal.contactName')).max(100),
  email: z.string().email(t('auth.emailInvalid')),
  message: z.string().min(10).max(2000),
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
  }
  catch {
    toast.add({
      color: 'error',
      title: t('legal.contactError'),
      icon: 'i-lucide-alert-circle',
    })
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 py-12">
    <UCard>
      <template #header>
        <h1 class="text-2xl font-bold">
          {{ t('legal.contactTitle') }}
        </h1>
        <p class="text-sm text-[var(--ui-text-muted)] mt-1">
          {{ t('legal.contactSubtitle') }}
        </p>
      </template>

      <!-- Success state -->
      <UAlert
        v-if="success"
        color="success"
        variant="subtle"
        icon="i-lucide-check-circle"
        :title="t('legal.contactSuccess')"
        class="mb-4"
      />

      <UForm
        v-else
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <!-- Honeypot (hidden from real users) -->
        <input
          name="website"
          class="hidden"
          v-model="honeypot"
          tabindex="-1"
          autocomplete="off"
        />

        <UFormField :label="t('legal.contactName')" name="name" required>
          <UInput
            v-model="state.name"
            :placeholder="t('legal.contactNamePlaceholder')"
            icon="i-lucide-user"
            size="lg"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('legal.contactEmail')" name="email" required>
          <UInput
            v-model="state.email"
            type="email"
            :placeholder="t('legal.contactEmailPlaceholder')"
            icon="i-lucide-mail"
            size="lg"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('legal.contactMessage')" name="message" required>
          <UTextarea
            v-model="state.message"
            :placeholder="t('legal.contactMessagePlaceholder')"
            :rows="6"
            size="lg"
            class="w-full"
          />
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
  </div>
</template>
