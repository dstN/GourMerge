<script setup lang="ts">
/**
 * Auth Layout — Minimal centered layout for login/register pages
 */
const { t } = useI18n()
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-[var(--ui-bg)] p-4">
    <div class="w-full max-w-md">
      <!-- Brand -->
      <div class="text-center mb-8">
        <NuxtLink to="/" class="inline-flex items-center gap-2.5 group">
          <CommonBrandLogo class="size-10 text-primary-500 group-hover:text-primary-400 transition-colors" />
          <span class="text-3xl font-bold tracking-tight">
            Gour<span class="text-primary-500">Merge</span>
          </span>
        </NuxtLink>
      </div>

      <!-- Content -->
      <slot />

      <!-- Footer -->
      <div class="mt-8 flex flex-col items-center gap-2">
        <p class="text-center text-sm text-[var(--ui-text-dimmed)]">
          © {{ new Date().getFullYear() }} GourMerge
        </p>
        <div class="flex items-center gap-3 flex-wrap justify-center">
          <NuxtLink
            to="/legal/impressum"
            class="text-xs text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] transition-colors"
          >
            {{ t('legal.impressum') }}
          </NuxtLink>
          <NuxtLink
            to="/legal/datenschutz"
            class="text-xs text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] transition-colors"
          >
            {{ t('legal.datenschutz') }}
          </NuxtLink>
          <NuxtLink
            to="/legal/contact"
            class="text-xs text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] transition-colors"
          >
            {{ t('legal.contact') }}
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
