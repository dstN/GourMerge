/**
 * One of two places (with assets/css/main.css) where a visual decision may be made — see
 * DESIGNBOOK.md. Every default set here exists so no call site has to pass the prop.
 *
 * `ui.<component>.defaultVariants.<prop>` wins over the component's own default
 * but loses to an explicitly-passed prop, so an override is always possible where
 * the design book allows one.
 *
 * `ui.<component>.slots.<slot>` is merged into the theme slot with
 * tailwind-merge, so adding a class here appends it everywhere.
 */

/**
 * Form controls collapse to content width out of the box: `UInput`, `UTextarea`,
 * `UInputMenu` and `UInputNumber` have an `inline-flex` **root**, `USelect` and
 * `USelectMenu` an `inline-flex` **base**. That is why `class="w-full"` used to be
 * sprinkled across some call sites and forgotten at others, leaving login's inputs
 * content-width and settings' full-width. Fixed once, here.
 */
const FULL_WIDTH_ROOT = { slots: { root: 'w-full' }, defaultVariants: { size: 'md' as const } }
const FULL_WIDTH_BASE = { slots: { base: 'w-full' }, defaultVariants: { size: 'md' as const } }

export default defineAppConfig({
  ui: {
    /**
     * Maps our brand ramps (main.css `@theme`) onto Nuxt UI's semantic colors.
     * Without this, Nuxt UI v4 falls back to its default green primary.
     */
    colors: {
      primary: 'primary',
      secondary: 'secondary',
      neutral: 'slate',
    },

    // DO NOT set defaultVariants on button/badge/card: appConfig defaults are resolved before a
    // component's own declared defaults, and 44 Nuxt UI components render a nested UButton/UBadge
    // internally (Modal close button, Toast, ColorModeButton, …) — this overrides their intended
    // styling too. Badge preference belongs on our own call sites instead — see DESIGNBOOK §7.

    // ── Form controls — DESIGNBOOK §3 ────────────────────────────
    // Slot classes are safe to set globally: they are additive (tailwind-merge),
    // so a nested InputMenu simply also becomes full width, which is correct.
    input: FULL_WIDTH_ROOT,
    textarea: FULL_WIDTH_ROOT,
    inputMenu: FULL_WIDTH_ROOT,
    inputNumber: FULL_WIDTH_ROOT,
    select: FULL_WIDTH_BASE,
    selectMenu: FULL_WIDTH_BASE,

    // ── Alerts — always the tinted variant ───────────────────────
    // Safe: no other Nuxt UI component we use renders a nested UAlert, and all
    // five of our alerts are informational rather than solid-primary shouting.
    alert: {
      defaultVariants: {
        variant: 'subtle',
      },
    },

    // Shimmer instead of pulse. Only the animation is swapped — shape/surface stay Nuxt UI's
    // default (`animate-pulse rounded-md bg-elevated`), so future upstream changes still reach us.
    // `shimmer shimmer-bg` (tw-shimmer plugin, main.css) needs both classes: `shimmer-bg` sets the
    // surface-preset variables, `shimmer` carries the gradient/animation. `bg-elevated` survives
    // shimmer's `background` shorthand because Tailwind sorts background-color after
    // background-image. `gm-skeleton` adds our brand colour (`--shimmer-color`) and the
    // reduced-motion opt-out the plugin lacks.
    skeleton: {
      base: 'shimmer shimmer-bg gm-skeleton rounded-md bg-elevated',
    },
  },
})
