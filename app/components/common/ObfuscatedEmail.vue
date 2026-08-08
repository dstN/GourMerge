<script setup lang="ts">
/**
 * Registers as <CommonObfuscatedEmail> — Nuxt path-prefixes subdirectory components, so the
 * bare name would render nothing.
 *
 * Must stay readable without JS (§5 DDG) and survive a screen reader (no rtl-reversal trick),
 * while the plain address never appears as contiguous text or in an href in the SSR'd HTML: a
 * `display:none`, `aria-hidden` decoy poisons naive `textContent` scraping, and the mailto:
 * href is attached only after mount. Defeats simple harvesters, not a headless-browser one —
 * the contact form is the fallback for those.
 */
const props = withDefaults(
  defineProps<{
    user?: string
    domain?: string
    /** Text spliced in invisibly to poison scraped textContent. */
    decoy?: string
  }>(),
  {
    user: 'info',
    domain: 'gourmerge.de',
    decoy: '.remove-this-to-write-us.',
  }
)

// Left undefined during SSR on purpose: an href would hand the address straight
// to anything parsing mailto: links out of the HTML.
const href = ref<string | undefined>()

onMounted(() => {
  href.value = `mailto:${props.user}@${props.domain}`
})
</script>

<template>
  <a :href="href" class="link">
    <span>{{ user }}</span>
    <span class="hidden" aria-hidden="true">{{ decoy }}</span>
    <span>@{{ domain }}</span>
  </a>
</template>
