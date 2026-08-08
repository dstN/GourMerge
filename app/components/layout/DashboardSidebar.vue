<script setup lang="ts">
// `:to="item.to"` is a dynamic binding — @nuxtjs/i18n only rewrites static literal `to`s, so
// every path and the active-page comparison must go through localePath()/localised route.path.
const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()

const navItems = computed(() =>
  [
    { label: t('nav.dashboard'), icon: 'i-lucide-layout-dashboard', path: '/dashboard' },
    { label: t('nav.myRecipes'), icon: 'i-lucide-book-open', path: '/recipes' },
    { label: t('nav.starred'), icon: 'i-lucide-star', path: '/recipes/starred', tourId: 'favorites-nav' },
    { label: t('nav.explore'), icon: 'i-lucide-compass', path: '/explore' },
  ].map(({ label, icon, path, tourId }) => {
    const to = localePath(path)
    return { label, icon, to, active: route.path === to, tourId }
  })
)

const { data: recentRecipes } = useFetch<{ title: string; slug: string; owner: { username: string } }[]>(
  '/api/recipes',
  {
    headers: useRequestHeaders(['cookie']),
    transform: (recipes) => recipes?.slice(0, 5) || [],
  }
)
</script>

<template>
  <nav class="p-4 space-y-1">
    <!-- Shared with <LayoutMobileMenu> via navLinkClass() (app/utils/ui.ts) -->
    <NuxtLink
      v-for="item in navItems"
      :key="item.to"
      :to="item.to"
      :class="navLinkClass(item.active)"
      :data-tour="item.tourId"
    >
      <UIcon :name="item.icon" class="size-5 shrink-0" aria-hidden="true" />
      {{ item.label }}
    </NuxtLink>

    <!-- Quick actions -->
    <div class="pt-6 mt-6 border-t border-default space-y-2">
      <p class="px-3 mb-1 text-xs font-semibold uppercase tracking-wider text-dimmed">
        {{ t('nav.quickActions') }}
      </p>
      <UButton :label="t('nav.newRecipe')" icon="i-lucide-plus" variant="soft" block to="/recipes/new" />
      <UButton
        :label="t('profile.editSettings')"
        icon="i-lucide-user-cog"
        variant="ghost"
        color="neutral"
        block
        to="/settings"
      />
    </div>

    <!-- Recent Recipes -->
    <div v-if="recentRecipes && recentRecipes.length > 0" class="pt-6 mt-6 border-t border-default space-y-1">
      <p class="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-dimmed">
        {{ t('nav.recentRecipes') }}
      </p>
      <NuxtLink
        v-for="recipe in recentRecipes"
        :key="recipe.slug"
        :to="`/${recipe.owner.username}/${recipe.slug}`"
        :class="navLinkClass(route.path === `/${recipe.owner.username}/${recipe.slug}`)"
      >
        <UIcon name="i-lucide-history" class="size-4 shrink-0 opacity-70" aria-hidden="true" />
        <span class="truncate">{{ recipe.title }}</span>
      </NuxtLink>
    </div>
  </nav>
</template>
