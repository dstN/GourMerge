<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ layout: 'default' })

useSeoMeta({
  title: `${t('legal.impressumTitle')} — GourMerge`,
})
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 py-12">
    <UCard>
      <template #header>
        <h1 class="text-2xl font-bold">
          {{ t('legal.impressumTitle') }}
        </h1>
      </template>

      <div class="prose dark:prose-invert max-w-none space-y-4">
        <p class="text-sm text-[var(--ui-text-muted)]">
          Angaben gemäß § 5 DDG:
        </p>

        <address class="not-italic space-y-1 text-[var(--ui-text)]">
          <p class="font-semibold">
            Dustin Tramm
          </p>
          <p>c/o Impressumservice Dein-Impressum</p>
          <p>Stettiner Str. 41</p>
          <p>35410 Hungen</p>
          <p>Deutschland</p>
        </address>

        <div class="pt-2 border-t border-[var(--ui-border)]">
          <p class="text-sm text-[var(--ui-text-muted)]">
            E-Mail: <span class="italic">[PLACEHOLDER — wird noch ergänzt]</span>
          </p>
        </div>
      </div>
    </UCard>
  </div>
</template>
