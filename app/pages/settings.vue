<script setup lang="ts">
import type { UserProfile } from '~~/shared/types/recipe'
import { NOTIFICATION_KINDS, type NotificationKind } from '~~/shared/types/notification'

/**
 * `auth: true` was dead metadata — nothing reads `route.meta.auth` (there is no
 * global middleware), so this page had NO client-side guard and fell back to the
 * `default` layout instead of the dashboard shell. The API it calls is protected
 * server-side, so nothing leaked; an anonymous visitor just got a broken page
 * instead of a redirect to login.
 */
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()
const { user, fetch: refreshSession } = useUserSession()
const toast = useAppToast()

const form = reactive({
  displayName: '',
  bio: '',
  // All four locales are supported — this was typed `'de' | 'en'`, predating the
  // FR/IT rollout, so picking Français here was a type error that only didn't
  // surface because the value was never loaded from the profile either.
  preferredLocale: 'de' as 'de' | 'en' | 'fr' | 'it',
  preferredMeasurementSystem: 'metric' as MeasurementSystem,
})

// `true` = "notify me" — the inverse of the stored muted-kinds array, since a switch that
// reads as "muted" and defaults to off (i.e. notifications on) is backwards to look at.
const notifyPrefs = reactive<Record<NotificationKind, boolean>>(
  Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, true])) as Record<NotificationKind, boolean>
)

// Fetch current settings
const { data: profile } = useFetch<UserProfile>(() => `/api/users/${user.value?.username}`, {
  headers: useRequestHeaders(['cookie']),
})

watch(
  profile,
  (p) => {
    if (p?.user) {
      form.displayName = p.user.displayName || ''
      form.bio = p.user.bio || ''
      // These two were NOT loaded, so both selects always rendered their
      // hardcoded defaults ("Deutsch" / metric) no matter what was stored — and
      // because `save()` sends the whole form, editing only your bio silently
      // reset your language and measurement preference.
      form.preferredLocale = (p.user.preferredLocale as typeof form.preferredLocale) || 'de'
      form.preferredMeasurementSystem = (p.user.preferredMeasurementSystem as MeasurementSystem) || 'metric'
      const muted = new Set(p.user.notificationMutes ?? [])
      for (const kind of NOTIFICATION_KINDS) notifyPrefs[kind] = !muted.has(kind)
    }
  },
  { immediate: true }
)

const saving = ref(false)

async function save() {
  saving.value = true
  try {
    await $fetch('/api/users/me', {
      method: 'PATCH',
      body: {
        displayName: form.displayName || undefined,
        bio: form.bio || null,
        preferredLocale: form.preferredLocale,
        preferredMeasurementSystem: form.preferredMeasurementSystem,
        notificationMutes: NOTIFICATION_KINDS.filter((k) => !notifyPrefs[k]),
      },
    })
    await refreshSession()
    toast.success(t('settings.saved'))
  } catch {
    toast.error(t('settings.saveError'))
  } finally {
    saving.value = false
  }
}

useSeoMeta({ title: `${t('settings.title')}: GourMerge` })
</script>

<template>
  <CommonPageShell width="form">
    <CommonPageHeader :title="t('settings.title')" icon="i-lucide-settings" />

    <UCard>
      <div class="space-y-6">
        <UFormField :label="t('auth.displayName')">
          <UInput v-model="form.displayName" :placeholder="t('auth.displayNamePlaceholder')" icon="i-lucide-user" />
        </UFormField>

        <UFormField :label="t('settings.bio')">
          <UTextarea v-model="form.bio" :placeholder="t('settings.bioPlaceholder')" :rows="3" />
        </UFormField>

        <UFormField :label="t('settings.avatar')">
          <CommonAvatarUpload />
        </UFormField>

        <UFormField :label="t('settings.language')">
          <USelect
            v-model="form.preferredLocale"
            :items="[
              { label: 'Deutsch', value: 'de' },
              { label: 'English', value: 'en' },
              { label: 'Français', value: 'fr' },
              { label: 'Italiano', value: 'it' },
            ]"
            value-key="value"
          />
        </UFormField>

        <UFormField :label="t('settings.measurement')">
          <USelect
            v-model="form.preferredMeasurementSystem"
            :items="[
              { label: t('settings.metric'), value: 'metric' },
              { label: t('settings.imperial'), value: 'imperial' },
            ]"
            value-key="value"
          />
        </UFormField>
      </div>

      <template #footer>
        <div class="flex justify-end">
          <UButton :label="t('common.save')" icon="i-lucide-save" :loading="saving" @click="save" />
        </div>
      </template>
    </UCard>

    <UCard class="mt-6">
      <template #header>
        <h2 class="font-semibold">{{ t('notification.prefsTitle') }}</h2>
      </template>
      <div class="space-y-3">
        <div v-for="kind in NOTIFICATION_KINDS" :key="kind" class="flex items-center justify-between gap-4">
          <span class="text-sm">{{ t(`notification.kindLabel.${kind}`) }}</span>
          <USwitch v-model="notifyPrefs[kind]" />
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end">
          <UButton :label="t('common.save')" icon="i-lucide-save" :loading="saving" @click="save" />
        </div>
      </template>
    </UCard>

    <!-- Email, then sign-in security. Both security items below are opt-in; nothing here
         prompts for either. Passkeys come first: they replace the password entirely, so
         they are the stronger and simpler option, and TOTP below is the fallback for
         people who stay on passwords. -->
    <div class="mt-6 space-y-6">
      <CommonChangeEmailCard />
      <CommonPasskeyCard />
      <CommonTwoFactorCard />
    </div>
  </CommonPageShell>
</template>
