<script setup lang="ts">
/**
 * PageShell — the one and only page content container. DESIGNBOOK §4.2.
 *
 * Usage (Nuxt path-prefixes components in components/common/):
 *   <CommonPageShell width="wide">…</CommonPageShell>
 *
 * Owns the content cap, the responsive gutters and the vertical rhythm, so no
 * page root carries `max-w-*`, `px-*` or `py-*`. Before this existed, nine
 * different caps were in use and every page hardcoded a flat `px-4` while the
 * header used `px-4 sm:px-6 lg:px-8` — content and nav were misaligned by up to
 * 16px on desktop.
 *
 * `wide` is `max-w-7xl` on purpose: the exact cap of the header and footer, so a
 * grid page lines up with the nav above it.
 */
const props = withDefaults(
  defineProps<{
    /** Content cap. `form` = 2xl, `content` = 4xl, `wide` = 7xl (matches the header). */
    width?: 'form' | 'content' | 'wide'
    /** `none` drops the vertical padding for a page that owns its own section rhythm. */
    spacing?: 'page' | 'none'
  }>(),
  { width: 'content', spacing: 'page' }
)

const WIDTHS = {
  form: 'max-w-2xl',
  content: 'max-w-4xl',
  wide: 'max-w-7xl',
} as const
</script>

<template>
  <!-- `page-shell` is a styling hook, not decoration: inside a sidebar shell the cap must
       align left instead of centring, and that rule lives in main.css (DESIGNBOOK §12,
       one place per visual decision). See the `[data-shell='sidebar']` rule there. -->
  <div
    :class="[
      'page-shell mx-auto w-full px-4 sm:px-6 lg:px-8',
      WIDTHS[props.width],
      props.spacing === 'page' ? 'py-8 sm:py-10' : '',
    ]"
  >
    <slot />
  </div>
</template>
