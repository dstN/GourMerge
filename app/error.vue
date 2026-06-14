<script setup lang="ts">
/**
 * Global Error Page — Handles 404, 500, and all unhandled errors
 *
 * Displays a branded error screen instead of the raw Nuxt error page.
 */
import type { NuxtError } from '#app'

const props = defineProps<{
  error: NuxtError
}>()

const { t } = useI18n()

const errorConfig = computed(() => {
  const code = props.error.statusCode

  if (code === 404) {
    return {
      icon: 'i-lucide-search-x',
      title: t('error.notFoundTitle'),
      description: t('error.notFoundDescription'),
      color: 'text-primary-500',
    }
  }

  if (code === 403) {
    return {
      icon: 'i-lucide-shield-x',
      title: t('error.forbiddenTitle'),
      description: t('error.forbiddenDescription'),
      color: 'text-red-500',
    }
  }

  return {
    icon: 'i-lucide-server-crash',
    title: t('error.serverTitle'),
    description: t('error.serverDescription'),
    color: 'text-red-500',
  }
})

function handleClearError() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-[var(--ui-bg)] px-4">
    <div class="text-center max-w-md">
      <!-- Logo -->
      <NuxtLink to="/" class="inline-flex items-center gap-2 mb-8 group">
        <CommonBrandLogo class="size-8 text-primary-500 group-hover:text-primary-400 transition-colors" />
        <span class="text-xl font-bold">
          Gour<span class="text-primary-500">Merge</span>
        </span>
      </NuxtLink>

      <!-- Error Code -->
      <div class="text-8xl font-black text-[var(--ui-text-dimmed)] opacity-20 mb-4">
        {{ error.statusCode }}
      </div>

      <!-- Icon -->
      <UIcon
        :name="errorConfig.icon"
        :class="['size-16 mx-auto mb-4', errorConfig.color]"
      />

      <!-- Title & Description -->
      <h1 class="text-2xl font-bold mb-2">
        {{ errorConfig.title }}
      </h1>
      <p class="text-[var(--ui-text-muted)] mb-8">
        {{ errorConfig.description }}
      </p>

      <!-- Actions -->
      <div class="flex items-center justify-center gap-3">
        <UButton
          :label="t('error.goHome')"
          icon="i-lucide-home"
          size="lg"
          @click="handleClearError"
        />
        <UButton
          :label="t('error.goBack')"
          icon="i-lucide-arrow-left"
          variant="outline"
          color="neutral"
          size="lg"
          @click="$router.back()"
        />
      </div>

      <!-- Debug info (dev only) -->
      <details v-if="error.statusMessage" class="mt-8 text-left">
        <summary class="text-xs text-[var(--ui-text-dimmed)] cursor-pointer hover:text-[var(--ui-text-muted)]">
          {{ t('error.details') }}
        </summary>
        <pre class="mt-2 p-4 rounded-lg bg-[var(--ui-bg-elevated)] text-xs text-[var(--ui-text-muted)] overflow-x-auto">{{ error.statusMessage }}</pre>
      </details>
    </div>
  </div>
</template>
