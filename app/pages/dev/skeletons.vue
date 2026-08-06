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

/** Slow the shimmer right down so a single pass can be followed by eye. */
const slow = ref(false)
const paused = ref(false)
/** Position within one cycle, 0–100. Only has an effect while frozen. */
const phase = ref(30)

const duration = computed(() => (slow.value ? 6 : 1.2))

/**
 * A negative `animation-delay` on a paused animation holds it at an exact offset, which is
 * the only way to judge the band's *shape* — in motion the eye cannot hold an edge still,
 * and at 1.2s a pass is over before it can be studied. Scrubbing 0 → 100 walks the band
 * from the left edge to the right one; there are deliberately no empty frames at either end.
 */
const style = computed(() => ({
  animationDuration: `${duration.value}s`,
  animationPlayState: paused.value ? 'paused' : 'running',
  animationDelay: paused.value ? `-${((phase.value / 100) * duration.value).toFixed(3)}s` : '0s',
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
        Dev-only. The shimmer is a moving <code>background-position-x</code> over <code>--ui-primary</code> at a 32%
        peak, so it stays legible in both themes — use the theme toggle in the header to compare. The highlight must
        travel <strong>left to right</strong>; because the gradient is wider than the box, percentage positions invert
        and the keyframes count 100% → 0% to achieve that. Seventeen colour stops approximate a sine falloff: a
        three-stop ramp has a visible kink at each end and reads as a rectangle sliding past rather than as light.
      </p>
    </div>

    <div class="mb-6 flex flex-wrap items-center gap-2">
      <UButton
        :label="slow ? 'Normal speed (1.2s)' : 'Slow motion (6s)'"
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
