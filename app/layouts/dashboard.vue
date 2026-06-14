<script setup lang="ts">
/**
 * Dashboard Layout — Authenticated layout with sidebar and user header
 */
const { t } = useI18n()
const { loggedIn } = useUserSession()
</script>

<template>
  <div class="min-h-screen bg-[var(--ui-bg)] text-[var(--ui-text)]">
    <!-- ── Header ──────────────────────────────────────────── -->
    <header class="sticky top-0 z-50 backdrop-blur-xl bg-[var(--ui-bg)]/80 border-b border-[var(--ui-border)]">
      <div class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <!-- Logo -->
          <NuxtLink to="/dashboard" class="flex items-center gap-2.5 group">
            <UIcon
              name="i-lucide-chef-hat"
              class="size-7 text-primary-500 group-hover:text-primary-400 transition-colors"
            />
            <span class="text-xl font-bold tracking-tight">
              Gour<span class="text-primary-500">Merge</span>
            </span>
          </NuxtLink>

          <!-- Center nav -->
          <nav class="hidden md:flex items-center gap-1">
            <UButton
              :label="t('nav.dashboard')"
              variant="ghost"
              icon="i-lucide-layout-dashboard"
              to="/dashboard"
            />
            <UButton
              :label="t('nav.explore')"
              variant="ghost"
              icon="i-lucide-compass"
              to="/"
            />
            <UButton
              :label="t('nav.newRecipe')"
              variant="soft"
              icon="i-lucide-plus"
              color="primary"
              to="/recipes/new"
            />
          </nav>

          <!-- Right side -->
          <div class="flex items-center gap-2">
            <UColorModeButton />
            <LayoutUserDropdown v-if="loggedIn" />
          </div>
        </div>
      </div>
    </header>

    <!-- ── Body ────────────────────────────────────────────── -->
    <div class="max-w-screen-2xl mx-auto flex">
      <!-- Sidebar -->
      <aside class="hidden lg:block w-64 shrink-0 border-r border-[var(--ui-border)] min-h-[calc(100vh-4rem)]">
        <LayoutDashboardSidebar />
      </aside>

      <!-- Main content -->
      <main class="flex-1 px-4 sm:px-6 lg:px-8 py-8">
        <slot />
      </main>
    </div>
  </div>
</template>
