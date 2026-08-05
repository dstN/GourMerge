<script setup lang="ts">
/**
 * Landing page for the emailed confirmation link.
 *
 * Export  → confirms, then shows the download link (also sent by email).
 * Deletion → confirms, then asks for the scope. The destructive call is a
 *            separate, explicit click: opening a link from an inbox — which
 *            scanners and previewers do automatically — must never erase an
 *            account on its own.
 */
const { t } = useI18n()
const route = useRoute()

definePageMeta({ layout: 'default' })

useSeoMeta({
  title: () => `${t('legal.privacy.confirmTitle')} — GourMerge`,
  robots: 'noindex',
})

const token = computed(() => (route.query.token as string) || '')

type State = 'checking' | 'invalid' | 'export-ready' | 'deletion-scope' | 'deleted'
const state = ref<State>('checking')
const downloadUrl = ref('')
const deleteRecipes = ref<'delete' | 'keep'>('delete')
const working = ref(false)
const recipesWereDeleted = ref(false)

onMounted(async () => {
  if (!token.value) {
    state.value = 'invalid'
    return
  }
  try {
    const res = await $fetch<{ type: 'export' | 'deletion'; downloadUrl?: string }>('/api/privacy/confirm', {
      method: 'POST',
      body: { token: token.value },
    })
    if (res.type === 'export') {
      downloadUrl.value = res.downloadUrl ?? ''
      state.value = 'export-ready'
    } else {
      state.value = 'deletion-scope'
    }
  } catch {
    state.value = 'invalid'
  }
})

async function confirmDeletion() {
  working.value = true
  try {
    const res = await $fetch<{ recipesDeleted: boolean }>('/api/privacy/delete', {
      method: 'POST',
      body: { token: token.value, deleteRecipes: deleteRecipes.value === 'delete' },
    })
    recipesWereDeleted.value = res.recipesDeleted
    state.value = 'deleted'
  } catch {
    state.value = 'invalid'
  } finally {
    working.value = false
  }
}
</script>

<template>
  <div class="max-w-xl mx-auto px-4 py-12">
    <UCard>
      <template #header>
        <h1 class="text-2xl font-bold">{{ t('legal.privacy.confirmTitle') }}</h1>
      </template>

      <!-- checking -->
      <div v-if="state === 'checking'" class="text-center py-10">
        <UIcon name="i-lucide-loader-circle" class="size-8 mx-auto mb-3 animate-spin text-primary-500" />
        <p class="text-sm text-[var(--ui-text-muted)]">{{ t('legal.privacy.checking') }}</p>
      </div>

      <!-- invalid / expired -->
      <div v-else-if="state === 'invalid'" class="text-center py-8">
        <UIcon name="i-lucide-link-2-off" class="size-10 mx-auto mb-3 text-[var(--ui-text-muted)]" />
        <p class="text-sm text-[var(--ui-text-muted)] mb-6">{{ t('legal.privacy.invalidToken') }}</p>
        <UButton :label="t('legal.privacy.title')" to="/legal/data-request" variant="outline" />
      </div>

      <!-- export ready -->
      <div v-else-if="state === 'export-ready'" class="text-center py-6">
        <UIcon name="i-lucide-file-json" class="size-12 mx-auto mb-4 text-primary-500" />
        <h2 class="text-lg font-semibold mb-2">{{ t('legal.privacy.exportReadyTitle') }}</h2>
        <p class="text-sm text-[var(--ui-text-muted)] mb-6">{{ t('legal.privacy.exportReadyDesc') }}</p>
        <!-- Plain anchor, not NuxtLink: this is a file download, not a route. -->
        <UButton :to="downloadUrl" :label="t('legal.privacy.download')" icon="i-lucide-download" size="lg" external />
      </div>

      <!-- deletion: scope choice -->
      <div v-else-if="state === 'deletion-scope'">
        <h2 class="text-lg font-semibold mb-2">{{ t('legal.privacy.deletionScopeTitle') }}</h2>
        <p class="text-sm text-[var(--ui-text-muted)] mb-6">{{ t('legal.privacy.deletionScopeDesc') }}</p>

        <URadioGroup
          v-model="deleteRecipes"
          :items="[
            {
              label: t('legal.privacy.deleteRecipes'),
              description: t('legal.privacy.deleteRecipesDesc'),
              value: 'delete',
            },
            { label: t('legal.privacy.keepRecipes'), description: t('legal.privacy.keepRecipesDesc'), value: 'keep' },
          ]"
          value-key="value"
          class="mb-6"
        />

        <UAlert
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :description="t('legal.privacy.deleteIrreversible')"
          class="mb-4"
        />

        <UButton
          color="error"
          :label="t('legal.privacy.deleteNow')"
          icon="i-lucide-trash-2"
          :loading="working"
          size="lg"
          block
          @click="confirmDeletion"
        />
      </div>

      <!-- deleted -->
      <div v-else class="text-center py-8">
        <UIcon name="i-lucide-check-circle" class="size-12 mx-auto mb-4 text-primary-500" />
        <h2 class="text-lg font-semibold mb-2">{{ t('legal.privacy.deletedTitle') }}</h2>
        <p class="text-sm text-[var(--ui-text-muted)] mb-6">{{ t('legal.privacy.deletedDesc') }}</p>
        <UButton to="/" :label="t('nav.explore')" icon="i-lucide-compass" variant="outline" />
      </div>
    </UCard>
  </div>
</template>
