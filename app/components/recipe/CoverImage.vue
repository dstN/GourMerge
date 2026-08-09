<script setup lang="ts">
/**
 * RecipeCoverImage — the serving suggestion, rendered between the ingredients and the steps.
 *
 * That position is the whole point and it is not decorative sequencing: it is the seam in
 * the page where the reader switches from "do I want to make this / what do I need to buy"
 * to "how do I make it". A photo at the very top competes with the title for the first
 * impression and pushes the ingredient list — the part people actually scroll to — below
 * the fold on a phone. Between the two lists it does the job a serving suggestion is for:
 * it shows what the thing you just read the ingredients for is supposed to look like,
 * right before you start cooking.
 *
 * ## Why the attributes matter more than the styling
 *
 * `width`/`height` come from the stored dimensions and are set as real attributes, so the
 * browser reserves the exact aspect ratio before a single byte of the image arrives.
 * Without them, an image dropped into the middle of a page pushes everything below it
 * down on load — a layout shift worth 25% of the Lighthouse performance score, in the
 * one place on the page where it is most visible.
 *
 * `loading="lazy"` and `decoding="async"` because it is below the fold by construction,
 * and `fetchpriority="low"` so it never competes with the render-critical CSS.
 */
const props = defineProps<{
  recipeId: number
  image: { checksum: string; width: number; height: number; altText: string | null; mimeType: string }
}>()

const { t } = useI18n()

/**
 * The checksum in the query string is what makes the delivery route cacheable forever:
 * different bytes, different URL. See `server/api/recipes/[id]/image.get.ts`.
 */
const src = computed(() => `/api/recipes/${props.recipeId}/image?v=${props.image.checksum}`)

/**
 * An empty `alt` is the correct value for a decorative image, and a serving suggestion
 * next to a full recipe genuinely is one — but only if the author declined to describe
 * it. When they did write something, that text is the accessible name. Never a filename,
 * never "image".
 */
const alt = computed(() => props.image.altText || '')
</script>

<template>
  <figure class="mb-6">
    <img
      :src="src"
      :alt="alt"
      :width="image.width"
      :height="image.height"
      loading="lazy"
      decoding="async"
      fetchpriority="low"
      class="w-full h-auto rounded-lg border border-default bg-elevated object-cover"
    />
    <figcaption class="mt-2 flex items-center gap-1.5 text-xs text-dimmed">
      <UIcon name="i-lucide-camera" class="size-3.5 shrink-0" aria-hidden="true" />
      <span>{{ image.altText || t('recipe.imageCaption') }}</span>
    </figcaption>
  </figure>
</template>
