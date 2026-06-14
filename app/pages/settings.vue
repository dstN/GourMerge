<script setup lang="ts">
import type { UserProfile } from '~~/shared/types/recipe'

definePageMeta({ auth: true })

const { t } = useI18n()
const { user, fetch: refreshSession } = useUserSession()
const toast = useAppToast()

const form = reactive({
  displayName: '',
  bio: '',
  avatarUrl: '',
  preferredLocale: 'de' as 'de' | 'en',
  preferredMeasurementSystem: 'metric' as 'metric' | 'imperial',
})

// Fetch current settings
const { data: profile } = useFetch<UserProfile>(() => `/api/users/${user.value?.username}`, {
  headers: useRequestHeaders(['cookie']),
})

watch(profile, (p) => {
  if (p?.user) {
    form.displayName = p.user.displayName || ''
    form.bio = p.user.bio || ''
    form.avatarUrl = p.user.avatarUrl || ''
  }
}, { immediate: true })

const saving = ref(false)

async function save() {
  saving.value = true
  try {
    await $fetch('/api/users/me', {
      method: 'PATCH',
      body: {
        displayName: form.displayName || undefined,
        bio: form.bio || null,
        avatarUrl: form.avatarUrl || null,
        preferredLocale: form.preferredLocale,
        preferredMeasurementSystem: form.preferredMeasurementSystem,
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

useSeoMeta({ title: `${t('settings.title')} — GourMerge` })
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold mb-6">{{ t('settings.title') }}</h1>

    <UCard>
      <div class="space-y-6">
        <UFormField :label="t('auth.displayName')">
          <UInput v-model="form.displayName" :placeholder="t('auth.displayNamePlaceholder')" class="w-full" />
        </UFormField>

        <UFormField :label="t('settings.bio')">
          <UTextarea v-model="form.bio" :placeholder="t('settings.bioPlaceholder')" :rows="3" class="w-full" />
        </UFormField>

        <UFormField :label="t('settings.avatarUrl')">
          <UInput v-model="form.avatarUrl" :placeholder="t('settings.avatarUrlPlaceholder')" class="w-full" />
        </UFormField>

        <UFormField :label="t('settings.language')">
          <USelect
            v-model="form.preferredLocale"
            :options="[
              { label: 'Deutsch', value: 'de' },
              { label: 'English', value: 'en' },
            ]"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('settings.measurement')">
          <USelect
            v-model="form.preferredMeasurementSystem"
            :options="[
              { label: t('settings.metric'), value: 'metric' },
              { label: t('settings.imperial'), value: 'imperial' },
            ]"
            class="w-full"
          />
        </UFormField>
      </div>

      <template #footer>
        <div class="flex justify-end">
          <UButton
            :label="t('common.save')"
            icon="i-lucide-save"
            :loading="saving"
            @click="save"
          />
        </div>
      </template>
    </UCard>
  </div>
</template>
