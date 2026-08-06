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
      color: 'text-primary',
    }
  }

  if (code === 403) {
    return {
      icon: 'i-lucide-shield-x',
      title: t('error.forbiddenTitle'),
      description: t('error.forbiddenDescription'),
      color: 'text-error-500',
    }
  }

  return {
    icon: 'i-lucide-server-crash',
    title: t('error.serverTitle'),
    description: t('error.serverDescription'),
    color: 'text-error-500',
  }
})

function handleClearError() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <!-- `h-dvh` not `min-h-screen`, matching the app shell (DESIGNBOOK §4.1) -->
  <div class="flex h-dvh items-center justify-center overflow-y-auto bg-default text-default px-4 py-10">
    <div class="text-center max-w-md">
      <!-- Logo -->
      <NuxtLink to="/" class="inline-flex items-center gap-2 mb-8 group">
        <CommonBrandLogo class="size-8 text-primary transition-opacity group-hover:opacity-80" />
        <span class="text-xl font-bold"> Gour<span class="text-primary">Merge</span> </span>
      </NuxtLink>

      <!-- Error Code -->
      <div class="text-8xl font-black text-dimmed opacity-20 mb-4">
        {{ error.statusCode }}
      </div>

      <!-- Icon -->
      <UIcon :name="errorConfig.icon" :class="['size-12 mx-auto mb-4', errorConfig.color]" aria-hidden="true" />

      <!-- Title & Description -->
      <h1 class="text-2xl font-bold tracking-tight mb-2">
        {{ errorConfig.title }}
      </h1>
      <p class="text-muted mb-8">
        {{ errorConfig.description }}
      </p>

      <!-- Actions -->
      <div class="flex items-center justify-center gap-3">
        <UButton :label="t('error.goHome')" icon="i-lucide-home" size="lg" @click="handleClearError" />
        <UButton
          :label="t('error.goBack')"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="subtle"
          size="lg"
          @click="$router.back()"
        />
      </div>

      <!-- Debug info (dev only) -->
      <details v-if="error.statusMessage" class="mt-8 text-left">
        <summary class="text-xs text-dimmed cursor-pointer hover:text-muted">
          {{ t('error.details') }}
        </summary>
        <pre class="mt-2 p-4 rounded-lg bg-elevated text-xs text-muted overflow-x-auto">{{ error.statusMessage }}</pre>
      </details>
    </div>
  </div>
</template>
