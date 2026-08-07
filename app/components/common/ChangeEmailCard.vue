<script setup lang="ts">
/**
 * ChangeEmailCard — request an email address change, used on /settings.
 *
 * Usage (Nuxt path-prefixes components in components/common/):
 *   <CommonChangeEmailCard />
 *
 * Submitting here does NOT change the address. It only sends a confirmation link to the
 * new one — see `server/api/users/me/email.post.ts` for why: this is the same class of
 * action as a password change, so it is gated behind re-entering the current password,
 * and it needs proof the new address is reachable before anything switches.
 */
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const { t } = useI18n()
const { user } = useUserSession()
const { apiError } = useApiError()

const schema = z.object({
  newEmail: z.string().email(t('auth.emailInvalid')),
  password: z.string().min(1, t('auth.passwordRequired')),
})
type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({ newEmail: '', password: '' })

const open = ref(false)
const busy = ref(false)
const sentTo = ref('')

function openDialog() {
  state.newEmail = ''
  state.password = ''
  sentTo.value = ''
  open.value = true
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  busy.value = true
  try {
    await $fetch('/api/users/me/email', { method: 'POST', body: event.data })
    sentTo.value = event.data.newEmail
  } catch (err: unknown) {
    useAppToast().error(apiError(err, 'settings.changeEmailError'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">{{ t('settings.emailSectionTitle') }}</h2>
    </template>

    <div class="flex items-center justify-between gap-4">
      <div>
        <p class="text-sm text-muted">{{ t('settings.currentEmail') }}</p>
        <p class="font-medium">{{ user?.email }}</p>
      </div>
      <UButton
        variant="subtle"
        color="neutral"
        icon="i-lucide-mail"
        :label="t('settings.changeEmail')"
        @click="openDialog"
      />
    </div>

    <UModal v-model:open="open" :title="t('settings.changeEmail')">
      <template #body>
        <!-- Sent state: the request succeeded, nothing left to fill in. -->
        <div v-if="sentTo" class="text-center py-4 space-y-3">
          <UIcon name="i-lucide-mail-check" class="size-10 text-success-500 mx-auto" aria-hidden="true" />
          <p class="text-sm text-muted">{{ t('settings.emailChangeSent', { email: sentTo }) }}</p>
        </div>

        <UForm v-else :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
          <UFormField :label="t('settings.newEmail')" name="newEmail" required>
            <UInput v-model="state.newEmail" type="email" icon="i-lucide-mail" autocomplete="email" />
          </UFormField>

          <UFormField :label="t('auth.password')" name="password" required>
            <UInput
              v-model="state.password"
              type="password"
              icon="i-lucide-lock"
              autocomplete="current-password"
              :placeholder="t('settings.currentPasswordPlaceholder')"
            />
          </UFormField>

          <UButton type="submit" block :label="t('settings.sendConfirmation')" :loading="busy" />
        </UForm>
      </template>
    </UModal>
  </UCard>
</template>
