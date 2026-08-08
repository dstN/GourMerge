<script setup lang="ts">
// Names the 403 an unverified account hits on publish/GMR before they get there, with a
// resend button; only shown when REQUIRE_EMAIL_VERIFICATION is actually enforced.
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
