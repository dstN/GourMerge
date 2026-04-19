<script setup lang="ts">
/**
 * Auth Layout — Minimal centered layout for login/register pages
 */
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-[var(--ui-bg)] p-4">
    <div class="w-full max-w-md">
      <!-- Brand -->
      <div class="text-center mb-8">
        <NuxtLink to="/" class="inline-flex items-center gap-2.5 group">
          <UIcon
            name="i-lucide-chef-hat"
            class="size-10 text-primary-500 group-hover:text-primary-400 transition-colors"
          />
          <span class="text-3xl font-bold tracking-tight">
            Gour<span class="text-primary-500">Merge</span>
          </span>
        </NuxtLink>
      </div>

      <!-- Content -->
      <slot />

      <!-- Footer -->
      <p class="text-center text-sm text-[var(--ui-text-dimmed)] mt-8">
        © {{ new Date().getFullYear() }} GourMerge
      </p>
    </div>
  </div>
</template>
