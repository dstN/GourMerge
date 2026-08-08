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
  title: () => `${t('legal.privacy.title')}: GourMerge`,
  robots: 'noindex',
})

// Every constraint carries a translated message. The Zod locale map
// (app/plugins/zod-locale.client.ts) is the safety net if one is ever forgotten;
// these read better than Zod's generic wording. This schema previously had no
// messages at all, so a German visitor submitting it empty got
// "Invalid email address" and "Too small: expected string to have >=1 characters".
const schema = z.object({
  type: z.enum(['export', 'deletion'], { message: t('validation.selectOption') }),
  username: z
    .string()
    .min(1, t('validation.required'))
    .max(50, t('validation.tooLong', { max: 50 })),
  email: z.string().email(t('auth.emailInvalid')),
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
  <CommonPageShell width="form">
    <UCard>
      <template #header>
        <h1 class="text-2xl font-bold">{{ t('legal.privacy.title') }}</h1>
      </template>

      <div v-if="sent" class="text-center py-6">
        <UIcon name="i-lucide-mail-check" class="size-12 mx-auto mb-4 text-primary" />
        <h2 class="text-lg font-semibold mb-2">{{ t('legal.privacy.sentTitle') }}</h2>
        <p class="text-sm text-muted">{{ t('legal.privacy.sentDesc') }}</p>
      </div>

      <template v-else>
        <p class="text-sm text-muted mb-6">{{ t('legal.privacy.subtitle') }}</p>

        <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
          <UFormField :label="t('legal.privacy.typeLabel')" name="type" required>
            <USelect v-model="state.type" :items="typeItems" value-key="value" />
          </UFormField>

          <p class="text-xs text-muted -mt-2">
            {{ state.type === 'deletion' ? t('legal.privacy.typeDeletionDesc') : t('legal.privacy.typeExportDesc') }}
          </p>

          <UFormField :label="t('legal.privacy.username')" name="username" required>
            <UInput v-model="state.username" icon="i-lucide-at-sign" autocomplete="username" />
          </UFormField>

          <UFormField :label="t('legal.privacy.email')" name="email" required>
            <UInput v-model="state.email" type="email" icon="i-lucide-mail" autocomplete="email" />
          </UFormField>

          <UButton
            type="submit"
            :label="t('legal.privacy.submit')"
            icon="i-lucide-send"
            size="lg"
            block
            :loading="loading"
          />
        </UForm>
      </template>
    </UCard>
  </CommonPageShell>
</template>
