<script setup lang="ts">
/**
 * DashboardSidebar — Navigation sidebar for the dashboard layout
 *
 * ## Why every path goes through `localePath()`
 *
 * The template binds `:to="item.to"` — a dynamic binding. `@nuxtjs/i18n` rewrites a
 * *static literal* `to` (which is why `<UButton to="/explore">` in `LayoutMainNav` renders
 * `/en/explore`) and cannot touch a value that only exists at runtime. Measured on
 * `/en/dashboard`, the page carried both sets at once: `/en/recipes` from the header and a
 * bare `/recipes` from here. Clicking any sidebar item dropped an English visitor back into
 * German — the logo bug, once per sidebar row.
 *
 * `active` has to be compared against the localised path for the same reason: `route.path`
 * on `/en/dashboard` never equals `/dashboard`, so the current page was highlighted in the
 * default locale only.
 */
const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()

const navItems = computed(() =>
  [
    { label: t('nav.dashboard'), icon: 'i-lucide-layout-dashboard', path: '/dashboard' },
    { label: t('nav.myRecipes'), icon: 'i-lucide-book-open', path: '/recipes' },
    { label: t('nav.starred'), icon: 'i-lucide-star', path: '/recipes/starred' },
    { label: t('nav.explore'), icon: 'i-lucide-compass', path: '/explore' },
    { label: t('nav.newRecipe'), icon: 'i-lucide-plus-circle', path: '/recipes/new' },
  ].map(({ label, icon, path }) => {
    const to = localePath(path)
    return { label, icon, to, active: route.path === to }
  })
)
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
