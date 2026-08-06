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

const slow = ref(false)
const paused = ref(false)
/** Position within one cycle, 0–100. Only has an effect while frozen. */
const phase = ref(30)

/** How long a frozen cycle is taken to be, so a phase can be turned into a delay. */
const FROZEN_CYCLE_S = 2

/**
 * Slow motion goes through `--shimmer-speed` (px/sec) rather than `animation-duration`,
 * because that is the knob tw-shimmer actually exposes: it derives the duration from
 * distance ÷ speed, so overriding the duration directly would decouple the two and every
 * element would then take the same time regardless of width — the exact thing the plugin
 * exists to avoid. 150px/s is roughly a seventh of the surface default.
 *
 * Freezing is different and does need an explicit duration: a negative `animation-delay` on
 * a paused animation holds it at an exact offset, and computing that offset requires knowing
 * the cycle length. Judging the band's *shape* is impossible otherwise — in motion the eye
 * cannot hold an edge still, and a real pass is over in well under a second.
 */
const style = computed(() =>
  paused.value
    ? {
        animationDuration: `${FROZEN_CYCLE_S}s`,
        animationPlayState: 'paused',
        animationDelay: `-${((phase.value / 100) * FROZEN_CYCLE_S).toFixed(3)}s`,
      }
    : { '--shimmer-speed': slow.value ? '150' : null }
)

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
        Dev-only. The shimmer is the <code>tw-shimmer</code> plugin (<code>shimmer shimmer-bg</code>), tinted with our
        brand orange through <code>--shimmer-color</code> — 40% in light, 60% in dark, so use the theme toggle in the
        header to compare. Its speed is defined in px/sec, not seconds, so every shape below moves at the same velocity
        regardless of width; that is what &ldquo;Slow motion&rdquo; changes. Freeze plus the phase slider holds one pass
        still so the band&rsquo;s shape can be judged.
      </p>
    </div>

    <div class="mb-6 flex flex-wrap items-center gap-2">
      <UButton
        :label="slow ? 'Normal speed (1000px/s)' : 'Slow motion (150px/s)'"
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
      <label class="flex items-center gap-2 text-xs text-muted">
        <span class="tabular-nums">Phase {{ phase }}%</span>
        <input v-model.number="phase" type="range" min="0" max="100" class="w-48" @input="paused = true" />
      </label>
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
