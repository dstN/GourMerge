<script setup lang="ts">
/**
 * UserDropdown — the avatar, and the single home for everything about *your* account.
 *
 * ## The trigger is an avatar, not a username
 *
 * A username in the header is a variable-width string in a fixed-width row: it pushed the
 * whole control cluster around by up to 70px depending on who was signed in, which is what
 * made aligning anything to the header's centre group impossible (see the note that used to
 * live in `main.css`). An avatar is a constant 32px. It also says who you are faster than
 * text does, which is why every comparable product does it.
 *
 * Users without an uploaded picture get a generated QR-code avatar
 * (`<CommonUserAvatar>` → `/api/users/:username/avatar`) rather than a shared placeholder
 * icon: it is per-user, so accounts are visually distinguishable, and it is a working QR
 * that opens that profile when scanned.
 *
 * ## What is in the menu
 *
 * Account-scoped destinations only. `Entdecken`, `Meine Rezepte`, `Favoriten` and
 * `Neues Rezept` live in `<LayoutMainNav>` and are deliberately NOT repeated here — that
 * triple-listing is what this pass removed. `Dashboard` is here rather than in the nav
 * because the logo already goes there, so it needs a named entry somewhere but not a third
 * one.
 *
 * ## The items array is typed, and that is not decoration
 *
 * The logout entry once carried `click: handleLogout` — the Nuxt UI **v3** API. In v4 a
 * `DropdownMenuItem` has `onSelect`, and `click` is simply not a property the renderer
 * looks at, so the entry rendered perfectly and did nothing at all when clicked. Signing
 * out was impossible from the desktop header for as long as the app had been on v4.
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
 * `<LayoutMobileMenu>` still needs `localePath` on every entry: it binds `:to` on a bare
 * `<NuxtLink>`, which nothing auto-localizes.
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
      label: t('nav.publicProfile'),
      icon: 'i-lucide-id-card',
      color: 'neutral' as const,
      to: `/${user.value?.username ?? ''}`,
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
    <!-- A plain button rather than <UButton>: the avatar is the whole control, and a
         button's own padding and hover fill would put a box around a picture. `aria-label`
         carries the name, since the trigger has no text. -->
    <button
      type="button"
      class="flex items-center gap-1 rounded-full p-0.5 transition-opacity hover:opacity-80"
      :aria-label="t('nav.accountMenu', { name: user?.displayName || user?.username || '' })"
    >
      <CommonUserAvatar
        :username="user?.username ?? ''"
        :display-name="user?.displayName"
        :avatar-url="user?.avatarUrl"
        size="sm"
      />
      <UIcon name="i-lucide-chevron-down" class="size-4 text-muted" aria-hidden="true" />
    </button>
  </UDropdownMenu>
</template>
