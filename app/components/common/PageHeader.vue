<script setup lang="ts">
/**
 * PageHeader — title block for every page. DESIGNBOOK §4.3.
 *
 * Usage (Nuxt path-prefixes components in components/common/):
 *   <CommonPageHeader :title="t('nav.myRecipes')" :subtitle="t('dashboard.subtitle')">
 *     <template #actions><UButton … size="lg" /></template>
 *   </CommonPageHeader>
 *
 * The only place `text-2xl sm:text-3xl font-bold` appears outside the landing
 * page. Replaces eight hand-rolled header rows that had drifted across three
 * heading sizes and two alignment strategies.
 */
defineProps<{
  title: string
  subtitle?: string
  /** Leading icon, rendered at `size-6` and brand-coloured. Decorative. */
  icon?: string
  /** Renders an "← label" link above the title, for pages nested under a recipe. */
  backTo?: string
  backLabel?: string
}>()
</script>

<template>
  <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div class="min-w-0">
      <NuxtLink
        v-if="backTo"
        :to="backTo"
        class="mb-2 inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-default"
      >
        <UIcon name="i-lucide-arrow-left" class="size-4" aria-hidden="true" />
        <span class="truncate">{{ backLabel }}</span>
      </NuxtLink>

      <h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
        <UIcon v-if="icon" :name="icon" class="size-6 shrink-0 text-primary" aria-hidden="true" />
        <span class="min-w-0">{{ title }}</span>
        <slot name="title-suffix" />
      </h1>

      <p v-if="subtitle" class="mt-1 text-muted">{{ subtitle }}</p>
      <slot name="meta" />
    </div>

    <div v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
