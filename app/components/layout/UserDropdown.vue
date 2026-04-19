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
  [{
    label: user.value?.displayName || user.value?.username || '',
    type: 'label' as const,
    icon: 'i-lucide-user',
  }],
  [{
    label: t('nav.dashboard'),
    icon: 'i-lucide-layout-dashboard',
    click: () => navigateTo('/dashboard'),
  }, {
    label: t('nav.myRecipes'),
    icon: 'i-lucide-book-open',
    click: () => navigateTo('/dashboard'),
  }, {
    label: t('nav.newRecipe'),
    icon: 'i-lucide-plus',
    click: () => navigateTo('/recipes/new'),
  }],
  [{
    label: t('auth.logout'),
    icon: 'i-lucide-log-out',
    click: handleLogout,
  }],
])
</script>

<template>
  <UDropdownMenu :items="items">
    <UButton
      variant="ghost"
      :label="user?.username"
      icon="i-lucide-user-circle"
      trailing-icon="i-lucide-chevron-down"
      size="sm"
    />
  </UDropdownMenu>
</template>
