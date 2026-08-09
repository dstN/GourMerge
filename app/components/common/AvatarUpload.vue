<script setup lang="ts">
/**
 * CommonAvatarUpload — pick, crop and store the current user's profile picture, used on
 * /settings. Replaces the old free-text avatar URL field: pasting an arbitrary URL meant a
 * profile picture could point at any origin, silently change later, or serve mixed content.
 * `PUT/DELETE /api/users/me/avatar` are now the only writers of `users.avatar_url`.
 *
 * Self-contained like `RecipeImageUpload`: on a successful upload or removal it calls
 * `refreshSession()` rather than emitting for a parent to react to, because the one thing
 * that needs to know is `useUserSession()`'s cached copy — everywhere else that renders an
 * avatar reads that, or re-fetches the profile it belongs to.
 */
const { t } = useI18n()
const { user, fetch: refreshSession } = useUserSession()
const { apiError } = useApiError()
const toast = useAppToast()

const fileInput = ref<HTMLInputElement | null>(null)
const pickedFile = ref<File | null>(null)
const cropOpen = ref(false)
const busy = ref(false)

/** Mirrors the server's allowlist, so the OS picker does not offer what would 415. */
const ACCEPT = 'image/jpeg,image/png,image/webp'

function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Cleared immediately: without this, picking the same file twice in a row fires no
  // second `change` event and the cropper silently does not open.
  input.value = ''
  if (!file) return
  pickedFile.value = file
  cropOpen.value = true
}

async function onCropped(blob: Blob) {
  cropOpen.value = false
  busy.value = true
  try {
    const form = new FormData()
    form.append('file', blob, 'avatar.webp')
    await $fetch('/api/users/me/avatar', { method: 'PUT', body: form })
    await refreshSession()
    toast.success(t('settings.avatarSaved'))
  } catch (e: unknown) {
    toast.error(apiError(e, 'settings.avatarError'))
  } finally {
    busy.value = false
    pickedFile.value = null
  }
}

async function removeAvatar() {
  busy.value = true
  try {
    await $fetch('/api/users/me/avatar', { method: 'DELETE' })
    await refreshSession()
    toast.success(t('settings.avatarRemoved'))
  } catch (e: unknown) {
    toast.error(apiError(e, 'settings.avatarError'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex items-start gap-3">
    <CommonUserAvatar
      :username="user?.username ?? ''"
      :display-name="user?.displayName"
      :avatar-url="user?.avatarUrl"
      size="lg"
    />
    <div class="min-w-0 flex-1 space-y-2">
      <div class="flex flex-wrap gap-2">
        <UButton
          :label="user?.avatarUrl ? t('settings.avatarReplace') : t('settings.avatarUpload')"
          icon="i-lucide-image-up"
          size="sm"
          color="neutral"
          variant="outline"
          :loading="busy"
          @click="() => fileInput?.click()"
        />
        <UButton
          v-if="user?.avatarUrl"
          :label="t('common.delete')"
          icon="i-lucide-trash-2"
          size="sm"
          color="error"
          variant="outline"
          :loading="busy"
          @click="removeAvatar"
        />
      </div>
      <p class="text-xs text-dimmed">{{ t('settings.avatarHint') }}</p>
    </div>

    <!-- A native input is the only way to open a file picker. Visually hidden rather than
         `display:none`, so it stays in the accessibility tree and remains reachable by
         keyboard; the button above is what everyone else clicks. -->
    <input
      ref="fileInput"
      type="file"
      :accept="ACCEPT"
      class="sr-only"
      :aria-label="t('settings.avatarUpload')"
      @change="onPick"
    />

    <UModal v-model:open="cropOpen" :title="t('settings.avatarCropTitle')">
      <template #body>
        <CommonAvatarCropper v-if="pickedFile" :file="pickedFile" @cropped="onCropped" @cancel="cropOpen = false" />
      </template>
    </UModal>
  </div>
</template>
