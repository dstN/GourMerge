<script setup lang="ts">
/**
 * Dev-only preview for the skeleton sweep — /dev/skeletons
 *
 * Real skeletons are visible for a few hundred milliseconds, which makes "is the animation
 * working?" almost impossible to answer by browsing. This page holds them still so the
 * sweep can be watched, slowed down, and compared against a static surface.
 *
 * 404s outside development. It is a debugging surface, not a feature: shipping it would
 * add a public page with no purpose and one more thing to translate.
 */
if (!import.meta.dev) {
  throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}

definePageMeta({ layout: 'default' })

// Deliberately plain English and not translated: dev-only, never user-facing.
useSeoMeta({ title: 'Skeleton preview — dev', robots: 'noindex,nofollow' })

/** Slow the sweep right down so a single pass can be followed by eye. */
const slow = ref(false)
const paused = ref(false)

const style = computed(() => ({
  animationDuration: slow.value ? '6s' : '',
  animationPlayState: paused.value ? 'paused' : '',
}))

const shapes = [
  { label: 'Card block (h-48) — as used on /explore', class: 'h-48 rounded-lg' },
  { label: 'Page title (h-8, 2/3 width)', class: 'h-8 w-2/3' },
  { label: 'Meta line (h-4, 1/3 width)', class: 'h-4 w-1/3' },
  { label: 'Avatar (size-12, round)', class: 'size-12 rounded-full' },
  { label: 'Button (h-9, w-28)', class: 'h-9 w-28' },
  { label: 'Full-width bar (h-64)', class: 'h-64 w-full rounded-lg' },
]
</script>

<template>
  <CommonPageShell width="content">
    <div class="mb-6">
      <h1 class="text-2xl font-bold">Skeleton preview</h1>
      <p class="mt-1 text-sm text-muted">
        Dev-only. The sweep is a moving <code>background-position-x</code> over <code>--ui-bg-inverted</code> at 22%, so
        it darkens in light mode and lightens in dark mode. Use the theme toggle in the header to compare. The highlight
        must travel <strong>left to right</strong>; because the gradient is wider than the box, the keyframes count 200%
        → 0% to achieve that.
      </p>
    </div>

    <div class="mb-6 flex flex-wrap items-center gap-2">
      <UButton
        :label="slow ? 'Normal speed (2s)' : 'Slow motion (6s)'"
        :icon="slow ? 'i-lucide-gauge' : 'i-lucide-snail'"
        color="neutral"
        variant="outline"
        size="sm"
        @click="slow = !slow"
      />
      <UButton
        :label="paused ? 'Resume' : 'Freeze'"
        :icon="paused ? 'i-lucide-play' : 'i-lucide-pause'"
        color="neutral"
        variant="outline"
        size="sm"
        @click="paused = !paused"
      />
    </div>

    <!-- Side by side with a static surface: the sweep is subtle by design, and the only
         honest way to judge "is it visible" is against the colour it sits on. -->
    <UCard class="mb-6">
      <template #header>
        <h2 class="text-lg font-semibold">Animated vs. static</h2>
      </template>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <p class="mb-2 text-xs font-medium text-muted">USkeleton (sweeping)</p>
          <USkeleton class="h-24 rounded-lg" :style="style" />
        </div>
        <div>
          <p class="mb-2 text-xs font-medium text-muted">bg-elevated (no animation)</p>
          <div class="h-24 rounded-lg bg-elevated" />
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">Every shape in use</h2>
      </template>
      <div class="space-y-5">
        <div v-for="shape in shapes" :key="shape.label">
          <p class="mb-2 text-xs font-medium text-muted">{{ shape.label }}</p>
          <USkeleton :class="shape.class" :style="style" />
        </div>
      </div>
    </UCard>
  </CommonPageShell>
</template>
