<script setup lang="ts">
// Items use `onSelect`, not `click` — Nuxt UI v4's item API (see the no-restricted-syntax
// lint rule). `to` needs no localePath(): items render through ULink, which auto-localizes.
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
