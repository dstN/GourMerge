<script setup lang="ts">
const { t } = useI18n()
const { loggedIn } = useUserSession()
const tour = useProductTour()
const { resetOnboarding } = useOnboarding()

const items = computed(() => [
  {
    label: t('help.startTour'),
    icon: 'i-lucide-compass',
    click: () => tour.start(),
  },
  {
    label: t('help.resetOnboarding'),
    icon: 'i-lucide-refresh-cw',
    click: async () => { await resetOnboarding(); tour.start() },
  },
  {
    label: t('help.glossary'),
    icon: 'i-lucide-book-open',
    to: '/help/glossary',
  },
])
</script>

<template>
  <UDropdownMenu
    v-if="loggedIn"
    :items="items"
    :ui="{ width: 'w-52' }"
  >
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
