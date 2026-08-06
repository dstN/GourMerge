<script setup lang="ts">
/**
 * MobileMenu — hamburger + offcanvas panel for small screens (md:hidden).
 *
 * Structure is deliberately ordered by what the visitor came for:
 *   1. Account CTA (guests) — signing up is the primary action; it used to sit at
 *      the very bottom under two blocks of preference chrome.
 *   2. Navigation.
 *   3. Help.
 *   4. Account actions (signed in).
 *   5. Preferences, last, as a compact single row — they were previously two
 *      full-width rows with uppercase micro-headings, which for a guest meant more
 *      chrome than content: the whole panel was "Sprache", "Darstellung" and one
 *      nav link.
 */
const { t, locale, setLocale } = useI18n()
const { loggedIn, user, clear } = useUserSession()
const route = useRoute()
const tour = useProductTour()

const open = ref(false)
// Close the panel whenever navigation happens.
watch(
  () => route.fullPath,
  () => {
    open.value = false
  }
)

const localeItems = [
  { label: 'Deutsch', value: 'de' },
  { label: 'English', value: 'en' },
  { label: 'Français', value: 'fr' },
  { label: 'Italiano', value: 'it' },
]

/** Mirrors the desktop header: Explore is public, the rest needs an account. */
const navLinks = computed(() =>
  loggedIn.value
    ? [
        { label: t('nav.dashboard'), icon: 'i-lucide-layout-dashboard', to: '/dashboard' },
        { label: t('nav.myRecipes'), icon: 'i-lucide-book-open', to: '/recipes' },
        { label: t('nav.starred'), icon: 'i-lucide-star', to: '/recipes/starred' },
        { label: t('nav.explore'), icon: 'i-lucide-compass', to: '/explore' },
        { label: t('nav.newRecipe'), icon: 'i-lucide-plus-circle', to: '/recipes/new' },
      ]
    : [{ label: t('nav.explore'), icon: 'i-lucide-compass', to: '/explore' }]
)

async function logout() {
  await $fetch('/auth/logout', { method: 'POST' })
  await clear()
  open.value = false
  navigateTo('/')
}

function startTour() {
  open.value = false
  tour.start()
}

// Shared with <LayoutDashboardSidebar> via navLinkClass() (app/utils/ui.ts)
const linkClass = (to: string) => navLinkClass(route.path === to)
</script>

<template>
  <div class="md:hidden">
    <USlideover v-model:open="open" side="right" :title="t('nav.menu')">
      <UButton icon="i-lucide-menu" color="neutral" variant="ghost" :aria-label="t('a11y.openMenu')" />

      <template #body>
        <div class="flex flex-col gap-5">
          <!-- Guests: the reason most of them opened this panel. Solid + subtle
               pair per DESIGNBOOK §2.2 so both boxes read the same size. -->
          <div v-if="!loggedIn" class="flex flex-col gap-2">
            <UButton :label="t('auth.register')" icon="i-lucide-user-plus" size="lg" block to="/auth/register" />
            <UButton
              :label="t('auth.login')"
              icon="i-lucide-log-in"
              size="lg"
              color="neutral"
              variant="subtle"
              block
              to="/auth/login"
            />
          </div>

          <!-- Navigation -->
          <nav class="flex flex-col gap-1">
            <NuxtLink v-for="item in navLinks" :key="item.to" :to="item.to" :class="linkClass(item.to)">
              <UIcon :name="item.icon" class="size-5 shrink-0" aria-hidden="true" />
              {{ item.label }}
            </NuxtLink>
          </nav>

          <!-- Help. The glossary explains the git-for-recipes model, so it is the
               single most useful link for someone who has not signed up yet. -->
          <div class="flex flex-col gap-1 border-t border-default pt-4">
            <NuxtLink to="/help/glossary" :class="linkClass('/help/glossary')">
              <UIcon name="i-lucide-book-marked" class="size-5 shrink-0" aria-hidden="true" />
              {{ t('help.glossary') }}
            </NuxtLink>
            <button v-if="loggedIn" type="button" :class="navLinkClass(false)" @click="startTour">
              <UIcon name="i-lucide-compass" class="size-5 shrink-0" aria-hidden="true" />
              {{ t('help.startTour') }}
            </button>
          </div>

          <!-- Signed-in account actions -->
          <div v-if="loggedIn" class="flex flex-col gap-1 border-t border-default pt-4">
            <p class="px-3 pb-1 text-sm font-medium truncate">{{ user?.displayName || user?.username }}</p>
            <NuxtLink to="/settings" :class="linkClass('/settings')">
              <UIcon name="i-lucide-user-pen" class="size-5 shrink-0" aria-hidden="true" />
              {{ t('nav.editProfile') }}
            </NuxtLink>
            <button type="button" :class="navLinkClass(false)" @click="logout">
              <UIcon name="i-lucide-log-out" class="size-5 shrink-0" aria-hidden="true" />
              {{ t('auth.logout') }}
            </button>
          </div>

          <!-- Preferences, compact and last: one row, no headings. -->
          <div class="flex items-center gap-2 border-t border-default pt-4">
            <USelect
              :model-value="locale"
              :items="localeItems"
              value-key="value"
              icon="i-lucide-languages"
              :aria-label="t('a11y.selectLanguage')"
              @update:model-value="setLocale($event as 'de' | 'en' | 'fr' | 'it')"
            />
            <UColorModeButton class="shrink-0" />
          </div>
        </div>
      </template>
    </USlideover>
  </div>
</template>
