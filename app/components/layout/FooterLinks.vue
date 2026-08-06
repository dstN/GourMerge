<script setup lang="ts">
/**
 * FooterLinks — the legal/meta link row. DESIGNBOOK §2 ("footer / legal link").
 *
 * Extracted because the identical four-button block was duplicated verbatim in
 * `default.vue` and `dashboard.vue`, which is exactly how a footer ends up with
 * two different button sizes.
 */
const { t } = useI18n()
</script>

<template>
  <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
    <UButton
      label="GitHub"
      color="neutral"
      variant="ghost"
      size="xs"
      icon="i-simple-icons-github"
      to="https://github.com"
      target="_blank"
    />
    <UButton :label="t('legal.impressum')" color="neutral" variant="ghost" size="xs" to="/legal/impressum" />
    <UButton :label="t('legal.datenschutz')" color="neutral" variant="ghost" size="xs" to="/legal/datenschutz" />
    <UButton :label="t('legal.contact')" color="neutral" variant="ghost" size="xs" to="/legal/contact" />
  </div>
</template>
