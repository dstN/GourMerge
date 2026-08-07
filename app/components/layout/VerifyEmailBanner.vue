<script setup lang="ts">
/**
 * "Your email is not verified yet" — shown across the authenticated shell.
 *
 * ## Why it exists
 *
 * With `REQUIRE_EMAIL_VERIFICATION=true`, an unverified account is silently barred
 * from publishing a public recipe, making a recipe public, and opening a GourMerge
 * request — each of which answers 403. Nothing in the app said so, and nothing
 * offered a way to fix it, so the only visible symptom was a form that refused to
 * submit. This banner is the missing half of that gate: it names the reason before
 * the user hits it, and carries the resend button.
 *
 * ## Why it is conditional on `emailVerificationRequired`
 *
 * Where the flag is off (dev, CI) an unverified address costs the user nothing, and a
 * permanent banner about a restriction that is not in force is just noise people learn
 * to ignore — including on the day it starts mattering.
 */
const { t } = useI18n()
const { user, session, fetch: refreshSession } = useUserSession()
const { apiError } = useApiError()

const show = computed(() => Boolean(session.value?.emailVerificationRequired) && user.value?.emailVerified === false)

const sending = ref(false)
const sent = ref(false)
const error = ref('')

async function resend() {
  sending.value = true
  error.value = ''
  try {
    const result = await $fetch<{ sent?: boolean; alreadyVerified?: boolean }>('/auth/send-verification', {
      method: 'POST',
    })
    // Already verified elsewhere (another browser, or the link was clicked while this
    // tab sat open). Re-read the session so the banner disappears instead of claiming
    // to have sent a mail that the server deliberately did not send.
    if (result?.alreadyVerified) await refreshSession()
    else sent.value = true
  } catch (err: unknown) {
    error.value = apiError(err, 'auth.resendVerificationError')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div v-if="show" class="border-b border-default bg-elevated">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
      <UAlert
        :color="sent ? 'success' : 'warning'"
        variant="soft"
        :icon="sent ? 'i-lucide-mail-check' : 'i-lucide-mail-warning'"
        :title="sent ? t('auth.verificationSentTitle') : t('auth.unverifiedTitle')"
        :description="
          error || (sent ? t('auth.verificationSentBody', { email: user?.email }) : t('auth.unverifiedBody'))
        "
      >
        <template v-if="!sent" #actions>
          <UButton
            color="warning"
            variant="solid"
            size="xs"
            :loading="sending"
            :label="t('auth.resendVerification')"
            @click="resend"
          />
        </template>
      </UAlert>
    </div>
  </div>
</template>
