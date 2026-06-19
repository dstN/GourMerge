<script setup lang="ts">
/**
 * UserDropdown — Avatar + dropdown menu for authenticated users
 */
const { t } = useI18n()
const { user, clear } = useUserSession()

async function handleLogout() {
  await $fetch('/auth/logout', { method: 'POST' })
  await clear()
  navigateTo('/')
}

const items = computed(() => [
  [
    {
      label: user.value?.displayName || user.value?.username || '',
      type: 'label' as const,
      icon: 'i-lucide-user',
      color: 'neutral' as const,
    },
  ],
  [
    {
      label: t('nav.dashboard'),
      icon: 'i-lucide-layout-dashboard',
      color: 'neutral' as const,
      to: '/dashboard',
    },
    {
      label: t('nav.myRecipes'),
      icon: 'i-lucide-book-open',
      color: 'neutral' as const,
      to: '/recipes',
    },
    {
      label: t('nav.newRecipe'),
      icon: 'i-lucide-plus',
      color: 'neutral' as const,
      to: '/recipes/new',
    },
    {
      label: t('nav.editProfile'),
      icon: 'i-lucide-user-pen',
      color: 'neutral' as const,
      to: '/settings',
    },
  ],
  [
    {
      label: t('auth.logout'),
      icon: 'i-lucide-log-out',
      color: 'neutral' as const,
      click: handleLogout,
    },
  ],
])
</script>

<template>
  <UDropdownMenu :items="items">
    <UButton
      variant="ghost"
      color="neutral"
      :label="user?.username"
      icon="i-lucide-user-circle"
      trailing-icon="i-lucide-chevron-down"
      size="sm"
    />
  </UDropdownMenu>
</template>
