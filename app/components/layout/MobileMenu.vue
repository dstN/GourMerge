<script setup lang="ts">
/**
 * MobileMenu — hamburger + offcanvas slideover for small screens (md:hidden).
 *
 * Collapses the header nav, dashboard nav, language switcher, theme toggle and
 * tour helper into a single tidy panel so the mobile header stays uncluttered.
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

const linkClass = (to: string) => [
  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
  route.path === to
    ? 'bg-primary-500/10 text-primary-500'
    : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-bg-elevated)]',
]
</script>

<template>
  <div class="md:hidden">
    <USlideover v-model:open="open" side="right" :title="t('nav.menu')">
      <UButton icon="i-lucide-menu" variant="ghost" color="neutral" :aria-label="t('a11y.openMenu')" />

      <template #body>
        <div class="flex flex-col gap-6">
          <!-- Primary navigation -->
          <nav class="flex flex-col gap-1">
            <NuxtLink v-for="item in navLinks" :key="item.to" :to="item.to" :class="linkClass(item.to)">
              <UIcon :name="item.icon" class="size-5 shrink-0" aria-hidden="true" />
              {{ item.label }}
            </NuxtLink>
          </nav>

          <!-- Preferences -->
          <div class="border-t border-[var(--ui-border)] pt-4 flex flex-col gap-4">
            <div class="flex flex-col gap-1.5">
              <span class="text-xs font-semibold uppercase tracking-wider text-[var(--ui-text-dimmed)]">
                {{ t('nav.language') }}
              </span>
              <USelect
                :model-value="locale"
                :items="localeItems"
                value-key="value"
                :aria-label="t('a11y.selectLanguage')"
                @update:model-value="setLocale($event as 'de' | 'en' | 'fr' | 'it')"
              />
            </div>

            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold uppercase tracking-wider text-[var(--ui-text-dimmed)]">
                {{ t('nav.appearance') }}
              </span>
              <UColorModeButton />
            </div>

            <!-- Tour / help (logged-in only) -->
            <div v-if="loggedIn" class="flex flex-col gap-1">
              <UButton
                :label="t('help.startTour')"
                icon="i-lucide-compass"
                variant="ghost"
                color="neutral"
                block
                class="justify-start"
                @click="startTour"
              />
              <UButton
                :label="t('help.glossary')"
                icon="i-lucide-book-open"
                variant="ghost"
                color="neutral"
                block
                class="justify-start"
                to="/help/glossary"
              />
            </div>
          </div>

          <!-- Account -->
          <div class="border-t border-[var(--ui-border)] pt-4">
            <template v-if="loggedIn">
              <p class="px-3 mb-2 text-sm font-medium truncate">{{ user?.displayName || user?.username }}</p>
              <UButton
                :label="t('nav.editProfile')"
                icon="i-lucide-user-pen"
                variant="ghost"
                color="neutral"
                block
                class="justify-start"
                to="/settings"
              />
              <UButton
                :label="t('auth.logout')"
                icon="i-lucide-log-out"
                variant="ghost"
                color="neutral"
                block
                class="justify-start"
                @click="logout"
              />
            </template>
            <template v-else>
              <UButton :label="t('auth.login')" variant="ghost" color="neutral" block to="/auth/login" />
              <UButton :label="t('auth.register')" color="primary" block class="mt-2" to="/auth/register" />
            </template>
          </div>
        </div>
      </template>
    </USlideover>
  </div>
</template>
