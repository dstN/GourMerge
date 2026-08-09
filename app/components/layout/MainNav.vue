<script setup lang="ts">
/**
 * MainNav — the one desktop header navigation, shared by the `default` and `dashboard`
 * layouts.
 *
 * ## What it is for, and what it is deliberately not for
 *
 * This carries **destinations you move between while working**: the public browse surface,
 * your own recipes, your favourites, and the one action worth a permanent button. It does
 * NOT carry account entries — those live in `<LayoutUserDropdown>`, which is the single
 * home for "things about me" (dashboard, settings, sign out).
 *
 * That split is the whole point. Before it, four destinations sat in this nav, the same
 * four plus two actions sat in a 256px dashboard sidebar, and four of them appeared a third
 * time in the user dropdown — fifteen entries for nine destinations, with no rule about
 * which copy to use. The sidebar is gone (see `layouts/dashboard.vue`) and every
 * destination now appears exactly once here or once in the account menu, never both.
 *
 * `Dashboard` is not in this list on purpose: the brand logo already points there for a
 * signed-in viewer, and the account menu names it. A third route to the same page is what
 * this pass exists to remove.
 *
 * `Entdecken` sits outside the `loggedIn` guard, also on purpose: it is the only public
 * browse surface, and gating the whole nav once left guests with no way to reach it from
 * the desktop header while the mobile menu still offered it.
 *
 * ## `lg`, not `md`
 *
 * Four labelled items plus the logo plus the control cluster (locale select, theme, help,
 * avatar) need about 1000px. At `md` the header's content measured **949px against a 768px
 * viewport** — and because the layout root is `h-dvh overflow-hidden`, that overflow was
 * clipped rather than scrolled, so the account menu was simply cut off between 768px and
 * ~1000px with nothing on screen to say so. `<LayoutMobileMenu>` already carries every one
 * of these destinations, so that range gets the offcanvas instead. The three files that
 * make up the switch — this nav, both layouts' control clusters, and the menu's own
 * `lg:hidden` — have to agree, or one of them reappears alone.
 */
const { t } = useI18n()
const { loggedIn } = useUserSession()
</script>

<template>
  <nav class="hidden lg:flex items-center gap-1">
    <UButton :label="t('nav.explore')" color="neutral" variant="ghost" icon="i-lucide-compass" to="/explore" />
    <UButton
      v-if="loggedIn"
      :label="t('nav.myRecipes')"
      color="neutral"
      variant="ghost"
      icon="i-lucide-book-open"
      to="/recipes"
    />
    <!-- Labelled like its neighbours. It shipped icon-only for one revision, on the theory
         that the star reads unambiguously and saves width — and it did read as an oversight
         instead: one bare glyph in a row of three labels looks like a link whose text failed
         to load, not like a deliberately quieter item. Rank is expressed by variant here
         (§2), not by withholding the word.
         Also the tour's `favorites-nav` anchor, which used to hang off the sidebar. -->
    <UButton
      v-if="loggedIn"
      :label="t('nav.starred')"
      color="neutral"
      variant="ghost"
      icon="i-lucide-star"
      to="/recipes/starred"
      data-tour="favorites-nav"
    />
    <!-- The one emphasised action in the cluster — DESIGNBOOK §2: idle nav is
         neutral/ghost, the primary action is soft. -->
    <UButton v-if="loggedIn" :label="t('nav.newRecipe')" variant="soft" icon="i-lucide-plus" to="/recipes/new" />
  </nav>
</template>
