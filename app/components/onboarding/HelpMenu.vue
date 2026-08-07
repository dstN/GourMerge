<script setup lang="ts">
/**
 * HelpMenu — product tour and glossary.
 *
 * Both actions used `click`, which is the Nuxt UI **v3** item API. v4 reads `onSelect` and
 * ignores anything else, so "Start tour" and "Reset onboarding" rendered and then did
 * nothing at all — the same bug that made logout unreachable. Neither typecheck nor lint
 * saw it; the guard that does is the `no-restricted-syntax` rule in `eslint.config.mjs`.
 *
 * `to` needs no `localePath()`: Nuxt UI renders items through `ULink`, which auto-localizes.
 */
import type { DropdownMenuItem } from '@nuxt/ui'

const { t } = useI18n()
const { loggedIn } = useUserSession()
const tour = useProductTour()
const { resetOnboarding } = useOnboarding()

const items = computed<DropdownMenuItem[]>(() => [
  {
    label: t('help.startTour'),
    icon: 'i-lucide-compass',
    onSelect: () => tour.start(),
  },
  {
    label: t('help.resetOnboarding'),
    icon: 'i-lucide-refresh-cw',
    onSelect: async () => {
      await resetOnboarding()
      tour.start()
    },
  },
  {
    label: t('help.glossary'),
    icon: 'i-lucide-book-open',
    to: '/help/glossary',
  },
])
</script>

<template>
  <UDropdownMenu v-if="loggedIn" :items="items">
    <UButton
      icon="i-lucide-circle-help"
      variant="ghost"
      color="neutral"
      size="sm"
      :aria-label="t('help.menu')"
      data-tour="help-menu"
    />
  </UDropdownMenu>
</template>
