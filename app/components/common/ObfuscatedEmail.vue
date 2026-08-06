<script setup lang="ts">
/**
 * Email address with basic harvester protection.
 *
 * Registers as <CommonObfuscatedEmail> — Nuxt path-prefixes components in
 * subdirectories, so the bare name would silently render nothing.
 *
 * Three things had to hold at once, and most obfuscation tricks break one:
 *
 *   1. It must be readable WITHOUT JavaScript. § 5 DDG requires the address to
 *      be available, so a JS-only render would trade a spam problem for a legal
 *      one. Here the visible text is fully server-rendered.
 *   2. It must survive a screen reader. The popular `direction: rtl` reversal
 *      trick fails this outright — assistive tech reads the reversed string —
 *      which would also be a regression against the axe gate.
 *   3. The plain address must not appear as contiguous text, nor in an href,
 *      in the server-rendered HTML.
 *
 * So: a `display:none` decoy is spliced into the text. `textContent` — what a
 * naive scraper reads — yields a broken address, while the decoy is invisible,
 * `aria-hidden` from assistive tech, and excluded from copy-paste selections.
 * The mailto: href is attached only after mount, so it is absent from the SSR
 * payload; without JS the address is still legible, just not clickable.
 *
 * This defeats simple harvesters, not a determined one driving a headless
 * browser. The contact form remains the robust channel.
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
