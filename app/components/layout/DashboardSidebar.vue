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
    to: '/recipes',
    active: route.path === '/recipes',
  },
  {
    label: t('nav.starred'),
    icon: 'i-lucide-star',
    to: '/recipes/starred',
    active: route.path === '/recipes/starred',
  },
  {
    label: t('nav.explore'),
    icon: 'i-lucide-compass',
    to: '/explore',
    active: route.path === '/explore',
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
    <!-- Shared with <LayoutMobileMenu> via navLinkClass() (app/utils/ui.ts) -->
    <NuxtLink v-for="item in navItems" :key="item.to" :to="item.to" :class="navLinkClass(item.active)">
      <UIcon :name="item.icon" class="size-5 shrink-0" aria-hidden="true" />
      {{ item.label }}
    </NuxtLink>

    <!-- Quick actions -->
    <div class="pt-6 mt-6 border-t border-default">
      <p class="px-3 mb-3 text-xs font-semibold uppercase tracking-wider text-dimmed">
        {{ t('nav.quickActions') }}
      </p>
      <UButton :label="t('nav.newRecipe')" icon="i-lucide-plus" variant="soft" block to="/recipes/new" />
    </div>
  </nav>
</template>
