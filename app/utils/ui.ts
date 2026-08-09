/**
 * Shared UI mappings — DESIGNBOOK §7.
 *
 * State→colour lives here, not at the call site, so the badge on a list page and
 * the badge on the matching detail page cannot drift apart. They previously did:
 * the GourMerge Request status map was duplicated in the list page and the detail
 * page, and difficulty colour was re-derived in three places.
 */
import type { BadgeProps } from '@nuxt/ui'

type Color = NonNullable<BadgeProps['color']>

/** GourMerge Request lifecycle. */
export const GMR_STATUS_COLOR: Record<string, Color> = {
  draft: 'warning',
  open: 'success',
  closed: 'neutral',
  merged: 'primary',
}

/** Recipe difficulty. */
export const DIFFICULTY_COLOR: Record<string, Color> = {
  easy: 'success',
  medium: 'warning',
  hard: 'error',
}

/**
 * Discussion thread category. `issue` is `error` rather than `warning` because it is the
 * only one of the four that reports something wrong with the recipe; the other three are
 * conversation and must not read as alarms.
 */
export const DISCUSSION_CATEGORY_COLOR: Record<string, Color> = {
  idea: 'primary',
  question: 'info',
  issue: 'error',
  praise: 'success',
}

/** Discussion thread category → its Lucide icon, so list and form cannot drift. */
export const DISCUSSION_CATEGORY_ICON: Record<string, string> = {
  idea: 'i-lucide-lightbulb',
  question: 'i-lucide-help-circle',
  issue: 'i-lucide-alert-triangle',
  praise: 'i-lucide-heart',
}

/**
 * Light-mode-readable label class for a tinted badge (DESIGNBOOK §1.6). The
 * `.tint-*` classes are defined in `main.css`; this maps a semantic colour onto
 * one so no call site writes `text-*-700 dark:text-*-400` by hand.
 */
export const TINT_CLASS: Record<string, string> = {
  success: 'tint-success',
  warning: 'tint-warning',
  error: 'tint-error',
  info: 'tint-info',
  primary: '',
  neutral: '',
}

/** The one card-grid definition (DESIGNBOOK §4.4). */
export const CARD_GRID = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'

/**
 * Sidebar / offcanvas nav link. `DashboardSidebar` and `MobileMenu` render the
 * same list of destinations and had byte-identical copies of this class list — one
 * of them would eventually have been restyled alone.
 */
export function navLinkClass(isActive: boolean): string[] {
  return [
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
    isActive ? 'bg-primary-500/10 text-primary-500' : 'text-muted hover:bg-elevated hover:text-default',
  ]
}
