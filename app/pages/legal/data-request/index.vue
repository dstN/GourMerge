<script setup lang="ts">
/**
 * GDPR self-service entry point (Art. 15 export / Art. 17 erasure).
 *
 * Deliberately reachable WITHOUT being logged in: someone who has lost access
 * to their account still has the right to an export or an erasure. Ownership is
 * proven by the confirmation email, not by a session.
 */
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const { t } = useI18n()

definePageMeta({ layout: 'default' })

useSeoMeta({
  title: () => `${t('legal.privacy.title')} — GourMerge`,
  robots: 'noindex',
})

const schema = z.object({
  type: z.enum(['export', 'deletion']),
  username: z.string().min(1).max(50),
  email: z.string().email(),
})
type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({ type: 'export', username: '', email: '' })
const loading = ref(false)
const sent = ref(false)

const typeItems = computed(() => [
  { label: t('legal.privacy.typeExport'), value: 'export' as const },
  { label: t('legal.privacy.typeDeletion'), value: 'deletion' as const },
])

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  try {
    await $fetch('/api/privacy/request', { method: 'POST', body: event.data })
    // Always shows the same result — the endpoint deliberately does not reveal
    // whether the account exists, and the UI must not undo that.
    sent.value = true
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-xl mx-auto px-4 py-12">
    <UCard>
      <template #header>
        <h1 class="text-2xl font-bold">{{ t('legal.privacy.title') }}</h1>
      </template>

      <div v-if="sent" class="text-center py-6">
        <UIcon name="i-lucide-mail-check" class="size-12 mx-auto mb-4 text-primary-500" />
        <h2 class="text-lg font-semibold mb-2">{{ t('legal.privacy.sentTitle') }}</h2>
        <p class="text-sm text-[var(--ui-text-muted)]">{{ t('legal.privacy.sentDesc') }}</p>
      </div>

      <template v-else>
        <p class="text-sm text-[var(--ui-text-muted)] mb-6">{{ t('legal.privacy.subtitle') }}</p>

        <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
          <UFormField :label="t('legal.privacy.typeLabel')" name="type">
            <USelect v-model="state.type" :items="typeItems" value-key="value" class="w-full" />
          </UFormField>

          <p class="text-xs text-[var(--ui-text-muted)] -mt-2">
            {{ state.type === 'deletion' ? t('legal.privacy.typeDeletionDesc') : t('legal.privacy.typeExportDesc') }}
          </p>

          <UFormField :label="t('legal.privacy.username')" name="username">
            <UInput v-model="state.username" icon="i-lucide-at-sign" class="w-full" autocomplete="username" />
          </UFormField>

          <UFormField :label="t('legal.privacy.email')" name="email">
            <UInput v-model="state.email" type="email" icon="i-lucide-mail" class="w-full" autocomplete="email" />
          </UFormField>

          <UButton
            type="submit"
            :label="t('legal.privacy.submit')"
            icon="i-lucide-send"
            :loading="loading"
            size="lg"
            block
          />
        </UForm>
      </template>
    </UCard>
  </div>
</template>
