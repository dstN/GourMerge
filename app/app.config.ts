/**
 * GourMerge — Nuxt UI theme configuration
 *
 * This file is one of the two places (with `assets/css/main.css`) where a visual
 * decision may be made. See DESIGNBOOK.md — every default set here exists so
 * that no call site has to pass the prop.
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

    /*
     * ── DO NOT set `defaultVariants` for `button`, `badge` or `card` ──────
     *
     * `useComponentProps` resolves `appConfig.ui.<component>.defaultVariants`
     * **before** a component's own declared prop defaults. 44 Nuxt UI components
     * internally render a `UButton` or `UBadge` and rely on those declared
     * defaults — Modal's close button, Pagination, Tabs, Toast, SelectMenu,
     * Carousel arrows, ColorModeButton…
     *
     * So a `button: { defaultVariants: { color: 'primary', variant: 'solid' } }`
     * here does not just set the app's default; it **overrides every one of those
     * components' intended styling**. It shipped briefly and turned the header's
     * theme toggle into a solid saffron block: `UColorModeButton` declares
     * `color: 'neutral', variant: 'ghost'`, and the appConfig entry outranked it.
     *
     * Nuxt UI's own button/card defaults already match what we want
     * (`primary`/`solid`/`md`, and `outline` for cards), so those entries bought
     * nothing and cost correctness. Badges genuinely differ from our preference
     * (theirs is `primary`/`solid`), but that preference belongs on our own call
     * sites, not on every nested badge in the library — see DESIGNBOOK §7.
     */

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

    // ── Skeletons — shimmer instead of pulse ─────────────────────
    // Nuxt UI's default base is `animate-pulse rounded-md bg-elevated`. Only the animation is
    // swapped; the shape and surface stay theirs, so a future Nuxt UI change to skeleton
    // colour still reaches us.
    //
    // `shimmer shimmer-bg` is the tw-shimmer plugin (imported in main.css). Both classes are
    // required and neither works alone: `shimmer-bg` only sets variables — surface preset
    // instead of text preset — while `shimmer` carries the gradient and the animation.
    //
    // `bg-elevated` must survive `shimmer`'s `background` SHORTHAND, which resets
    // background-color to transparent. It does, because Tailwind sorts background-color after
    // background-image in its utilities layer, and the upstream README relies on the same
    // thing (`shimmer shimmer-bg … bg-muted`). Verified on a rendered frame, not assumed.
    //
    // `gm-skeleton` carries only what is ours: the brand colour via `--shimmer-color`, plus
    // the reduced-motion opt-out the plugin does not provide. See main.css.
    skeleton: {
      base: 'shimmer shimmer-bg gm-skeleton rounded-md bg-elevated',
    },
  },
})
