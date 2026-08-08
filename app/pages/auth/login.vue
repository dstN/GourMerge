<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth', middleware: 'guest' })

const { t } = useI18n()
const { apiError } = useApiError()
const { fetch: fetchSession } = useUserSession()

useSeoMeta({
  title: `${t('auth.login')}: GourMerge`,
})

const loading = ref(false)
const error = ref('')

/**
 * Two-factor step. `/auth/login` returns `{ totpRequired: true }` **without** a
 * session for accounts that opted in, and the pending state lives in a short-lived
 * signed cookie — so this view is a continuation of the same attempt, not a
 * separate authenticated area.
 */
const totpRequired = ref(false)
const totpCode = ref('')

/**
 * Passkey sign-in. Usernameless: no email is sent, so the browser offers whichever
 * discoverable passkeys it holds for this domain. A successful assertion completes the
 * login outright — no password, no TOTP step (see the endpoint for why that is not a
 * downgrade).
 */
const { authenticate: passkeyAuthenticate } = useWebAuthn({
  authenticateEndpoint: '/auth/passkey-authenticate',
})

// Feature-detected on mount: `window` does not exist during SSR, and rendering a
// dead button on an unsupported browser is worse than not offering it.
const passkeySupported = ref(false)
onMounted(() => {
  passkeySupported.value = typeof window !== 'undefined' && !!window.PublicKeyCredential
})

async function signInWithPasskey() {
  loading.value = true
  error.value = ''
  try {
    await passkeyAuthenticate()
    await fetchSession()
    navigateTo('/dashboard')
  } catch (err: unknown) {
    // Dismissing the OS prompt is a DOMException, not a failure — the user simply
    // changed their mind, so it must not surface as an error.
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
      return
    }
    error.value = apiError(err, 'passkey.loginError')
  } finally {
    loading.value = false
  }
}

/**
 * Email OR username — deliberately not `.email()`.
 *
 * The field used to validate as an email address, which meant a user who knew their
 * username was told their own name was an "invalid email address" before the request
 * was even sent. The endpoint matches both columns (see `server/routes/auth/login.post.ts`
 * for why the two can never collide), so the only client-side rule left is non-empty.
 */
const schema = z.object({
  identifier: z.string().min(1, t('auth.identifierRequired')),
  password: z.string().min(1, t('auth.passwordRequired')),
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  identifier: '',
  password: '',
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  error.value = ''

  try {
    const res = await $fetch<{ success: boolean; totpRequired?: boolean }>('/auth/login', {
      method: 'POST',
      body: event.data,
    })
    if (res.totpRequired) {
      totpRequired.value = true
      return
    }
    await fetchSession()
    navigateTo('/dashboard')
  } catch (err: unknown) {
    error.value = apiError(err, 'auth.loginError')
  } finally {
    loading.value = false
  }
}

async function submitTotp() {
  if (!totpCode.value.trim()) return
  loading.value = true
  error.value = ''

  try {
    const res = await $fetch<{ usedRecoveryCode: boolean }>('/auth/login-2fa', {
      method: 'POST',
      body: { code: totpCode.value.trim() },
    })
    await fetchSession()
    if (res.usedRecoveryCode) {
      // Worth saying out loud: they just burned one of ten single-use codes.
      useAppToast().info(t('twofa.usedRecoveryCode'))
    }
    navigateTo('/dashboard')
  } catch (err: unknown) {
    error.value = apiError(err, 'twofa.invalidCode')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <h1 class="text-2xl font-bold text-center">
        {{ totpRequired ? t('twofa.challengeTitle') : t('auth.login') }}
      </h1>
      <p class="text-sm text-muted text-center mt-1">
        {{ totpRequired ? t('twofa.challengeDesc') : t('auth.loginSubtitle') }}
      </p>
    </template>

    <!-- ── Second factor ──────────────────────────────────────
         Replaces the credentials form rather than appearing beside it: the
         password step is already done, and showing both would invite re-entry. -->
    <form v-if="totpRequired" class="space-y-4" @submit.prevent="submitTotp">
      <UAlert
        v-if="error"
        color="error"
        icon="i-lucide-alert-circle"
        :title="error"
        :close-button="{ onClick: () => (error = '') }"
      />

      <UFormField :label="t('twofa.challengeCode')" :help="t('twofa.challengeRecoveryHint')" required>
        <UInput
          v-model="totpCode"
          inputmode="numeric"
          autocomplete="one-time-code"
          placeholder="000000"
          autofocus
          icon="i-lucide-shield-check"
        />
      </UFormField>

      <UButton
        type="submit"
        :label="t('twofa.challengeSubmit')"
        icon="i-lucide-log-in"
        size="lg"
        block
        :loading="loading"
        :disabled="!totpCode.trim()"
      />
    </form>

    <UForm v-else :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
      <!-- Error alert -->
      <UAlert
        v-if="error"
        color="error"
        icon="i-lucide-alert-circle"
        :title="error"
        :close-button="{ onClick: () => (error = '') }"
      />

      <!-- `type="text"`, not `type="email"`: the browser would otherwise refuse to submit a
           bare username as malformed. `autocomplete="username"` is what password managers
           key off for the identifier field, and it is correct for either value. -->
      <UFormField :label="t('auth.identifier')" name="identifier" required>
        <UInput
          v-model="state.identifier"
          type="text"
          autocomplete="username"
          :placeholder="t('auth.identifierPlaceholder')"
          icon="i-lucide-at-sign"
        />
      </UFormField>

      <UFormField :label="t('auth.password')" name="password" required>
        <UInput
          v-model="state.password"
          type="password"
          :placeholder="t('auth.passwordPlaceholder')"
          icon="i-lucide-lock"
        />
      </UFormField>

      <UButton type="submit" :label="t('auth.loginButton')" icon="i-lucide-log-in" size="lg" block :loading="loading" />

      <!-- Passkey alternative. Below the password form rather than above it: most
           visitors still have no passkey, and leading with an option they cannot use
           would be confusing. `subtle` per DESIGNBOOK §2.2 — a secondary next to a
           solid needs a visible surface or it reads smaller. -->
      <template v-if="passkeySupported">
        <USeparator :label="t('common.or')" />
        <UButton
          type="button"
          :label="t('passkey.loginButton')"
          icon="i-lucide-key-round"
          size="lg"
          color="neutral"
          variant="subtle"
          block
          :loading="loading"
          @click="signInWithPasskey"
        />
      </template>
    </UForm>

    <template #footer>
      <div class="space-y-2 text-center text-sm text-muted">
        <p>
          {{ t('auth.noAccount') }}
          <NuxtLink to="/auth/register" class="link font-medium">
            {{ t('auth.registerLink') }}
          </NuxtLink>
        </p>
        <p>
          <NuxtLink to="/auth/forgot-password" class="text-xs text-muted transition-colors hover:text-default">
            {{ t('auth.forgotPassword') }}
          </NuxtLink>
        </p>
      </div>
    </template>
  </UCard>
</template>
