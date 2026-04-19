<script setup lang="ts">
/**
 * DashboardSidebar — Navigation sidebar for the dashboard layout
 */
const { t } = useI18n()
const route = useRoute()

const navItems = computed(() => [
  {
    label: t('nav.dashboard'),
    icon: 'i-lucide-layout-dashboard',
    to: '/dashboard',
    active: route.path === '/dashboard',
  },
  {
    label: t('nav.myRecipes'),
    icon: 'i-lucide-book-open',
    to: '/dashboard',
    active: false,
  },
  {
    label: t('nav.explore'),
    icon: 'i-lucide-compass',
    to: '/',
    active: route.path === '/',
  },
  {
    label: t('nav.newRecipe'),
    icon: 'i-lucide-plus-circle',
    to: '/recipes/new',
    active: route.path === '/recipes/new',
  },
])
</script>

<template>
  <nav class="p-4 space-y-1">
    <NuxtLink
      v-for="item in navItems"
      :key="item.to"
      :to="item.to"
      :class="[
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
        item.active
          ? 'bg-primary-500/10 text-primary-500'
          : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-bg-elevated)]',
      ]"
    >
      <UIcon :name="item.icon" class="size-5" />
      {{ item.label }}
    </NuxtLink>

    <!-- Stats section -->
    <div class="pt-6 mt-6 border-t border-[var(--ui-border)]">
      <p class="px-3 text-xs font-semibold text-[var(--ui-text-dimmed)] uppercase tracking-wider mb-3">
        {{ t('nav.quickActions') }}
      </p>
      <UButton
        :label="t('nav.newRecipe')"
        icon="i-lucide-plus"
        color="primary"
        variant="soft"
        block
        to="/recipes/new"
      />
    </div>
  </nav>
</template>
