<script setup lang="ts">
/**
 * TwoFactorCard — opt-in TOTP enrolment, used on /settings.
 *
 * Usage (Nuxt path-prefixes components in components/common/):
 *   <CommonTwoFactorCard />
 *
 * Deliberately app-agnostic: the QR encodes a standard `otpauth://totp/…` URI, so
 * Google Authenticator, Authy, 1Password, Bitwarden, Aegis and Microsoft
 * Authenticator all work. The key is also shown as text, because a desktop without
 * a camera cannot scan and some apps only offer manual entry.
 *
 * Two-factor is entirely optional — nothing prompts for it and nothing depends on
 * it. This card just makes it available.
 */
const { t } = useI18n()
const { apiError } = useApiError()
const toast = useAppToast()

interface Status {
  enabled: boolean
  enabledAt: string | null
  recoveryCodesRemaining: number
}

const { data: status, refresh } = await useFetch<Status>('/api/auth/totp', {
  headers: useRequestHeaders(['cookie']),
})

// ── Enrolment ────────────────────────────────────────────────
const setupOpen = ref(false)
interface SetupResponse {
  secret: string
  uri: string
  qrDataUri: string
}
const setup = ref<SetupResponse | null>(null)
const setupCode = ref('')
const busy = ref(false)

/** Shown once, after confirmation — never retrievable afterwards. */
const recoveryCodes = ref<string[] | null>(null)
const copied = ref(false)

async function beginSetup() {
  busy.value = true
  try {
    // The path is passed as a plain string on purpose: with Nuxt 4.6's typed routes the
    // route-matching conditional type for this literal exceeds the compiler's stack depth
    // (TS2321), so the response is typed explicitly instead of inferred from the route.
    setup.value = await $fetch<SetupResponse>('/api/auth/totp/setup' as string, { method: 'POST' })
    setupCode.value = ''
    setupOpen.value = true
  } catch (e: unknown) {
    toast.error(apiError(e, 'common.error'))
  } finally {
    busy.value = false
  }
}

async function confirmSetup() {
  if (!setupCode.value.trim()) return
  busy.value = true
  try {
    const res = await $fetch<{ recoveryCodes: string[] }>('/api/auth/totp/confirm', {
      method: 'POST',
      body: { token: setupCode.value.trim() },
    })
    setupOpen.value = false
    setup.value = null
    recoveryCodes.value = res.recoveryCodes
    copied.value = false
    toast.success(t('twofa.enabledToast'))
    await refresh()
  } catch (e: unknown) {
    toast.error(apiError(e, 'twofa.invalidCode'))
  } finally {
    busy.value = false
  }
}

async function copyCodes() {
  if (!recoveryCodes.value) return
  await navigator.clipboard.writeText(recoveryCodes.value.join('\n'))
  copied.value = true
}

// ── Disabling ────────────────────────────────────────────────
const disableOpen = ref(false)
const disablePassword = ref('')

async function confirmDisable() {
  if (!disablePassword.value) return
  busy.value = true
  try {
    await $fetch('/api/auth/totp/disable', { method: 'POST', body: { password: disablePassword.value } })
    disableOpen.value = false
    disablePassword.value = ''
    toast.success(t('twofa.disabledToast'))
    await refresh()
  } catch (e: unknown) {
    toast.error(apiError(e, 'common.error'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-shield-check" class="size-5 text-primary" aria-hidden="true" />
        <h2 class="text-lg font-semibold">{{ t('twofa.title') }}</h2>
        <UBadge
          :color="status?.enabled ? 'success' : 'neutral'"
          variant="subtle"
          :class="status?.enabled ? 'tint-success' : ''"
          :label="status?.enabled ? t('twofa.statusOn') : t('twofa.statusOff')"
        />
      </div>
      <p class="mt-1 text-sm text-muted">{{ t('twofa.subtitle') }}</p>
    </template>

    <div class="space-y-4">
      <p class="text-sm text-muted">{{ t('twofa.appHint') }}</p>

      <p v-if="status?.enabled" class="text-sm text-muted">
        {{ t('twofa.recoveryRemaining', { n: status.recoveryCodesRemaining }) }}
      </p>

      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="!status?.enabled"
          :label="t('twofa.enable')"
          icon="i-lucide-shield-plus"
          :loading="busy"
          @click="beginSetup"
        />
        <UButton
          v-else
          :label="t('twofa.disable')"
          icon="i-lucide-shield-off"
          color="error"
          variant="outline"
          @click="
            () => {
              disableOpen = true
            }
          "
        />
      </div>
    </div>

    <!-- Enrolment modal -->
    <UModal v-model:open="setupOpen" :title="t('twofa.title')">
      <template #body>
        <div v-if="setup" class="space-y-4">
          <p class="text-sm">{{ t('twofa.setupScan') }}</p>
          <!-- Rendered server-side to a data: URI — the strict CSP forbids external
               image hosts, and it keeps the secret away from any third party. -->
          <img :src="setup.qrDataUri" :alt="t('twofa.setupScan')" class="mx-auto rounded-lg bg-white p-2" width="240" />

          <div>
            <p class="text-sm text-muted">{{ t('twofa.setupManual') }}</p>
            <code class="mt-1 block break-all rounded bg-elevated px-2 py-1 font-mono text-sm">{{ setup.secret }}</code>
          </div>

          <UFormField :label="t('twofa.setupCodeLabel')" required>
            <UInput
              v-model="setupCode"
              inputmode="numeric"
              autocomplete="one-time-code"
              placeholder="000000"
              maxlength="6"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            :label="t('twofa.setupCancel')"
            color="neutral"
            variant="subtle"
            @click="
              () => {
                setupOpen = false
              }
            "
          />
          <UButton
            :label="t('twofa.setupConfirm')"
            icon="i-lucide-shield-check"
            :loading="busy"
            :disabled="setupCode.trim().length < 6"
            @click="confirmSetup"
          />
        </div>
      </template>
    </UModal>

    <!-- Recovery codes, shown exactly once -->
    <UModal
      :open="!!recoveryCodes"
      :title="t('twofa.recoveryTitle')"
      :dismissible="false"
      @update:open="
        (v) => {
          if (!v) recoveryCodes = null
        }
      "
    >
      <template #body>
        <div class="space-y-4">
          <UAlert color="warning" icon="i-lucide-triangle-alert" :description="t('twofa.recoveryDesc')" />
          <ul class="grid grid-cols-2 gap-2 font-mono text-sm">
            <li v-for="code in recoveryCodes" :key="code" class="rounded bg-elevated px-2 py-1 text-center">
              {{ code }}
            </li>
          </ul>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            :label="copied ? t('twofa.recoveryCopied') : t('twofa.recoveryCopy')"
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            color="neutral"
            variant="subtle"
            @click="copyCodes"
          />
          <UButton
            :label="t('twofa.recoveryDone')"
            @click="
              () => {
                recoveryCodes = null
              }
            "
          />
        </div>
      </template>
    </UModal>

    <!-- Disable modal -->
    <UModal v-model:open="disableOpen" :title="t('twofa.disableTitle')">
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-muted">{{ t('twofa.disableDesc') }}</p>
          <UFormField :label="t('twofa.disablePassword')" required>
            <UInput v-model="disablePassword" type="password" autocomplete="current-password" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            :label="t('common.cancel')"
            color="neutral"
            variant="subtle"
            @click="
              () => {
                disableOpen = false
              }
            "
          />
          <UButton
            :label="t('twofa.disableConfirm')"
            color="error"
            :loading="busy"
            :disabled="!disablePassword"
            @click="confirmDisable"
          />
        </div>
      </template>
    </UModal>
  </UCard>
</template>
