<script setup lang="ts">
/**
 * MainNav — the desktop header navigation, shared by the `default` and `dashboard` layouts.
 *
 * Extracted because two hand-maintained copies had already drifted: `default.vue` was
 * missing "Meine Rezepte", so a signed-in visitor lost a nav item the moment they opened
 * an Impressum or a Datenschutz page and got it back on the way out. Nothing about that is
 * inferable from the UI, and a second copy is guaranteed to drift again — so there is now
 * one copy.
 *
 * `Entdecken` is deliberately outside the `loggedIn` guard: it is the only public browse
 * surface, and gating the whole nav left guests with no way to reach it from the desktop
 * header at all — while the mobile menu did offer it, which is how that inconsistency
 * originally surfaced.
 *
 * The `dashboard` layout only ever renders for a signed-in viewer, so the guards are
 * inert there; keeping them means one component serves both shells.
 */
const { t } = useI18n()
const { loggedIn } = useUserSession()
</script>

<template>
  <nav class="hidden md:flex items-center gap-1">
    <UButton
      v-if="loggedIn"
      :label="t('nav.dashboard')"
      color="neutral"
      variant="ghost"
      icon="i-lucide-layout-dashboard"
      to="/dashboard"
    />
    <UButton
      v-if="loggedIn"
      :label="t('nav.myRecipes')"
      color="neutral"
      variant="ghost"
      icon="i-lucide-book-open"
      to="/recipes"
    />
    <UButton :label="t('nav.explore')" color="neutral" variant="ghost" icon="i-lucide-compass" to="/explore" />
    <!-- The one emphasised action in the cluster — DESIGNBOOK §2: idle nav is
         neutral/ghost, the primary action is soft. -->
    <UButton v-if="loggedIn" :label="t('nav.newRecipe')" variant="soft" icon="i-lucide-plus" to="/recipes/new" />
  </nav>
</template>
