<script setup lang="ts">
/**
 * PasskeyCard — passkey enrolment and management, used on /settings.
 *
 * Usage (Nuxt path-prefixes components in components/common/):
 *   <CommonPasskeyCard />
 *
 * A passkey replaces the whole login (password *and* TOTP code), because the private
 * key never leaves the device and unlocking it needs a biometric or PIN. That reasoning
 * lives in `server/routes/auth/passkey-authenticate.post.ts`; the copy here says the
 * same thing in plain language, since "replaces your password" is the part a user
 * actually needs to understand.
 *
 * Renaming matters more than it looks: the default label is guessed from the user agent
 * ("Windows", "iPhone"), so two keys on one platform are indistinguishable — and you
 * can only safely revoke a key you can identify.
 */
const { t, locale } = useI18n()
const { apiError } = useApiError()
const toast = useAppToast()

interface Passkey {
  id: number
  name: string
  backedUp: boolean
  lastUsedAt: string | null
  createdAt: string
}

const { data, refresh } = await useFetch<{ passkeys: Passkey[] }>('/api/auth/passkeys', {
  headers: useRequestHeaders(['cookie']),
})

const { register } = useWebAuthn({ registerEndpoint: '/api/auth/passkeys/register' })

const busy = ref(false)

/**
 * Feature detection, not user-agent sniffing. Rendered client-side only: on the server
 * `window` does not exist, and guessing would either hide the card from capable
 * browsers or show a dead button to incapable ones.
 */
const supported = ref(true)
onMounted(() => {
  supported.value = typeof window !== 'undefined' && !!window.PublicKeyCredential
})

function fmtDate(value: string | null): string {
  if (!value) return ''
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(new Date(value))
}

async function addPasskey() {
  busy.value = true
  try {
    // The server ignores whatever userName we send and takes the identity from the
    // session instead — see the register handler's `validateUser`. Sending a
    // placeholder keeps the library's required-field check happy without implying the
    // client gets a say.
    await register({ userName: 'session' })
    toast.success(t('passkey.addedToast'))
    await refresh()
  } catch (e: unknown) {
    // A user who dismisses the OS prompt produces a DOMException, not an HTTP error.
    // Treating that as a failure would be wrong — they simply changed their mind.
    if (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'AbortError')) {
      toast.info(t('passkey.cancelled'))
    } else {
      toast.error(apiError(e, 'common.error'))
    }
  } finally {
    busy.value = false
  }
}

// ── Rename ───────────────────────────────────────────────────
const renaming = ref<Passkey | null>(null)
const newName = ref('')

async function confirmRename() {
  if (!renaming.value || !newName.value.trim()) return
  busy.value = true
  try {
    await $fetch(`/api/auth/passkeys/${renaming.value.id}`, {
      method: 'PATCH',
      body: { name: newName.value.trim() },
    })
    renaming.value = null
    toast.success(t('passkey.renamedToast'))
    await refresh()
  } catch (e: unknown) {
    toast.error(apiError(e, 'common.error'))
  } finally {
    busy.value = false
  }
}

// ── Remove ───────────────────────────────────────────────────
const removing = ref<Passkey | null>(null)

async function confirmRemove() {
  if (!removing.value) return
  busy.value = true
  try {
    await $fetch(`/api/auth/passkeys/${removing.value.id}`, { method: 'DELETE' })
    removing.value = null
    toast.success(t('passkey.removedToast'))
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
        <UIcon name="i-lucide-key-round" class="size-5 text-primary" aria-hidden="true" />
        <h2 class="text-lg font-semibold">{{ t('passkey.title') }}</h2>
        <UBadge v-if="data?.passkeys.length" :label="String(data.passkeys.length)" color="neutral" variant="subtle" />
      </div>
      <p class="mt-1 text-sm text-muted">{{ t('passkey.subtitle') }}</p>
    </template>

    <div class="space-y-4">
      <p class="text-sm text-muted">{{ t('passkey.explain') }}</p>

      <UAlert v-if="!supported" color="warning" icon="i-lucide-triangle-alert" :title="t('passkey.unsupported')" />

      <ul v-if="data?.passkeys.length" class="divide-y divide-default">
        <li v-for="pk in data.passkeys" :key="pk.id" class="flex flex-wrap items-center justify-between gap-3 py-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium truncate">{{ pk.name }}</span>
              <UBadge
                :label="pk.backedUp ? t('passkey.synced') : t('passkey.deviceBound')"
                :color="pk.backedUp ? 'success' : 'neutral'"
                variant="subtle"
                :class="pk.backedUp ? 'tint-success' : ''"
              />
            </div>
            <p class="mt-0.5 text-xs text-muted">
              {{ t('passkey.created', { date: fmtDate(pk.createdAt) }) }} ·
              {{ pk.lastUsedAt ? t('passkey.lastUsed', { date: fmtDate(pk.lastUsedAt) }) : t('passkey.neverUsed') }}
            </p>
          </div>

          <!-- Row actions — all `sm`, per DESIGNBOOK §2 -->
          <div class="flex shrink-0 items-center gap-2">
            <UButton
              :label="t('passkey.rename')"
              icon="i-lucide-pencil"
              size="sm"
              color="neutral"
              variant="outline"
              @click="
                () => {
                  renaming = pk
                  newName = pk.name
                }
              "
            />
            <UButton
              icon="i-lucide-trash-2"
              size="sm"
              color="error"
              variant="outline"
              :aria-label="t('passkey.remove')"
              @click="
                () => {
                  removing = pk
                }
              "
            />
          </div>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">{{ t('passkey.none') }}</p>

      <UButton
        :label="t('passkey.add')"
        icon="i-lucide-key-round"
        :loading="busy"
        :disabled="!supported"
        @click="addPasskey"
      />
    </div>

    <!-- Rename -->
    <UModal
      :open="!!renaming"
      :title="t('passkey.renameTitle')"
      @update:open="
        (v) => {
          if (!v) renaming = null
        }
      "
    >
      <template #body>
        <UFormField :label="t('passkey.nameLabel')" required>
          <UInput v-model="newName" maxlength="100" autofocus />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            :label="t('common.cancel')"
            color="neutral"
            variant="subtle"
            @click="
              () => {
                renaming = null
              }
            "
          />
          <UButton :label="t('common.save')" :loading="busy" :disabled="!newName.trim()" @click="confirmRename" />
        </div>
      </template>
    </UModal>

    <!-- Remove -->
    <UModal
      :open="!!removing"
      :title="t('passkey.removeTitle')"
      @update:open="
        (v) => {
          if (!v) removing = null
        }
      "
    >
      <template #body>
        <p class="text-sm text-muted">{{ t('passkey.removeConfirm') }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            :label="t('common.cancel')"
            color="neutral"
            variant="subtle"
            @click="
              () => {
                removing = null
              }
            "
          />
          <UButton
            :label="t('passkey.remove')"
            color="error"
            icon="i-lucide-trash-2"
            :loading="busy"
            @click="confirmRemove"
          />
        </div>
      </template>
    </UModal>
  </UCard>
</template>
