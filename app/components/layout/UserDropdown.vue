<script setup lang="ts">
/**
 * UserDropdown — Avatar + dropdown menu for authenticated users
 *
 * ## The items array is typed, and that is not decoration
 *
 * The logout entry carried `click: handleLogout` — the Nuxt UI **v3** API. In v4 a
 * `DropdownMenuItem` has `onSelect`, and `click` is simply not a property the renderer
 * looks at, so the entry rendered perfectly and did nothing at all when clicked. Signing
 * out was impossible from the desktop header for as long as the app has been on v4.
 *
 * Typecheck did not catch it because `DropdownMenuItem` extends `LinkProps` and the array
 * was built inside an untyped `computed`, where excess-property checking does not apply.
 * Annotating the computed is what turns the next dead handler into a build failure instead
 * of a button that silently does nothing.
 */
import type { DropdownMenuItem } from '@nuxt/ui'

const { t } = useI18n()
const { user, clear } = useUserSession()
/**
 * Only for `navigateTo` below — the `to` on the items does NOT need it.
 *
 * Nuxt UI renders menu entries through `ULink`, whose `locale` prop defaults to
 * auto-localizing via `$localePath` and detects an existing prefix so it cannot double up.
 * `navigateTo` is a plain router call with no component in the way, so it is the one place
 * here that would otherwise send a French visitor to the German landing page on sign-out.
 *
 * The components that DO need `localePath` on every entry are `LayoutDashboardSidebar` and
 * `LayoutMobileMenu`: they bind `:to` on a bare `<NuxtLink>`, which nothing auto-localizes.
 */
const localePath = useLocalePath()

async function handleLogout() {
  await $fetch('/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo(localePath('/'))
}

const items = computed<DropdownMenuItem[][]>(() => [
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
      onSelect: handleLogout,
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
