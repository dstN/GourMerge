# GourMerge — Design Book

> The single source of truth for how GourMerge looks. Derived from the design that
> already shipped, not invented alongside it: where the codebase disagreed with
> itself, the majority spelling won and the minority was migrated.
>
> **The rule that makes this document worth having:** a visual decision is made
> **once, centrally**, in `app/app.config.ts` or `app/assets/css/main.css`. A page
> or component may only override it when this document names the exception.
> `npm run design:check` fails CI on the violations that are mechanically
> detectable.

---

## 0. Why this exists

The UI drifted because styling was decided per call site. Measured on the
pre-refactor tree: 4 button sizes over 105 buttons with no rule mapping size to
rank; form controls at 3 sizes where `class="w-full"` was present on 9 controls
and absent on 23 identical ones (so login's inputs were content-width and
settings' were full-width); 9 different page content widths against a `max-w-7xl`
header; 207 hand-written `text-[var(--ui-text-muted)]`-style arbitrary classes
where Nuxt UI ships `text-muted`; and 8 raw `amber-*`/`orange-*` utilities
competing with the brand ramp.

None of that is catchable by the axe gate — contrast was fine. It is only
catchable by a written rule plus a linter.

---

## 1. Foundations

### 1.1 Color

There is **one** brand ramp. `primary` is the GourMerge saffron; `secondary` is
the herb green used for accents only.

| Role             | Token                                             | Notes                                                                                      |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Brand / primary  | `primary-50…950`                                  | Defined in `main.css` `@theme`. **Darkened 300–950 in light mode only** for WCAG AA (§1.6) |
| Accent           | `secondary-50…950`                                | Herb green. Decorative accents, never a CTA                                                |
| Semantic         | `success` `warning` `error` `info`                | Nuxt UI defaults                                                                           |
| Neutral          | `slate` via `ui.colors.neutral`                   | Surfaces, borders, body text                                                               |
| Diff             | `--color-diff-{added,removed,modified}-{bg,text}` | GitHub-style, light/dark pairs                                                             |
| Nutrition macros | `--gm-macro-{protein,carbs,fat}`                  | The macro bar and its legend read the same three tokens                                    |

**Forbidden:** any raw Tailwind palette utility for brand or state colour —
`amber-*`, `orange-*`, `yellow-*`, `red-*`, `green-*`, `lime-*`, `blue-*`. Use
the semantic ramp (`error-500`, not `red-500`) or a `--gm-*` token. The one
allowed exception is inside the tint helpers of §1.6, which exist precisely so
those literals live in a single file.

#### Brand foreground: `text-primary`, never `text-primary-500`

`text-primary` reads `--ui-primary`, Nuxt UI's **mode-aware** brand colour —
`primary-500` in light mode, `primary-400` in dark. A solid button's background
reads the same variable. A fixed `text-primary-500` therefore matches buttons in
light mode and drifts a visible shade off in dark mode, which is exactly how the
app ended up with brand-orange text that didn't match brand-orange buttons.

| Use                                  | Write                   |
| ------------------------------------ | ----------------------- |
| Brand-coloured text, icon, logo      | `text-primary`          |
| Brand-coloured fill (step number, …) | `bg-primary`            |
| A deliberate **tint** behind content | `bg-primary-500/10`     |
| A deliberate tinted border           | `border-primary-500/50` |

Tints and borders keep an explicit shade — a 10% wash is chosen against a shade,
not against the semantic colour. Foreground never does.

A hover that lightens the brand colour must not use `hover:text-primary-400`:
`text-primary` **is** `-400` in dark mode, so the hover would silently do nothing
there. Use `transition-opacity hover:opacity-80`.

### 1.2 Surfaces and text — use the utilities, not the variables

Nuxt UI v4 ships real Tailwind utilities for every semantic surface. Use them.

| Use                  | Write              | Never write                          |
| -------------------- | ------------------ | ------------------------------------ |
| Body text            | `text-default`     | `text-[var(--ui-text)]`              |
| Secondary text       | `text-muted`       | `text-[var(--ui-text-muted)]`        |
| Tertiary / meta text | `text-dimmed`      | `text-[var(--ui-text-dimmed)]`       |
| Emphasised heading   | `text-highlighted` | —                                    |
| Page background      | `bg-default`       | `bg-[var(--ui-bg)]`                  |
| Raised panel         | `bg-elevated`      | `bg-[var(--ui-bg-elevated)]`         |
| Hairline             | `border-default`   | `border-[var(--ui-border)]`          |
| Stronger hairline    | `border-accented`  | `border-[var(--ui-border-accented)]` |

The arbitrary-value form is not wrong, it is just a second spelling of the same
thing — and a second spelling is how drift starts. `design:check` rejects
`[var(--ui-…)]` in class attributes.

### 1.3 Radius

Everything derives from `--ui-radius` (`0.25rem`). Do not hardcode radii.

| Element                             | Class          |
| ----------------------------------- | -------------- |
| Cards, panels, modals               | `rounded-lg`   |
| Inputs, buttons, badges             | from the theme |
| Skeletons standing in for a card    | `rounded-lg`   |
| Pills, chips, avatars, step numbers | `rounded-full` |

A skeleton must carry the radius of the thing it replaces. `rounded-xl` on a
skeleton in front of a `rounded-lg` card is a visible pop on load.

### 1.4 Typography

`DM Sans` for everything, `JetBrains Mono` for quantities, units, commit ids and
code.

| Level                | Class                                           | Used by                     |
| -------------------- | ----------------------------------------------- | --------------------------- |
| Page title (`h1`)    | `text-2xl sm:text-3xl font-bold tracking-tight` | `<CommonPageHeader>`        |
| Page subtitle        | `text-muted`                                    | `<CommonPageHeader>`        |
| Section title (`h2`) | `text-lg font-semibold`                         | Card headers, page sections |
| Card title (`h3`)    | `text-base font-semibold`                       | `RecipeCard`, list rows     |
| Body                 | inherited                                       | —                           |
| Meta / caption       | `text-sm text-muted` or `text-xs text-dimmed`   | Timestamps, counts          |
| Numeric / unit       | `font-mono text-sm`                             | Ingredient quantities       |

**Documented exception — the landing page.** `app/pages/index.vue` is marketing
copy and keeps a display scale: hero `h1` at `text-5xl sm:text-6xl lg:text-7xl
font-extrabold`, section `h2` at `text-3xl sm:text-4xl font-bold`. No other page
may use these.

### 1.5 Links

One in-text link style, one class:

```html
<NuxtLink to="…" class="link">…</NuxtLink>
```

`.link` is defined in `main.css` and reads **`--ui-primary`** — the same variable a
solid button's background reads (§1.1). That is deliberate: hardcoding
`--color-primary-500` matched buttons in light mode and drifted a visible shade in
dark mode, so links and buttons looked like two different oranges.

It is **always underlined**, not underlined-on-hover: a link inside a paragraph
must be distinguishable from its surrounding text without relying on colour
(WCAG 1.4.1) — hover-only failed axe's `link-in-text-block` on the imprint page.
The resting underline is dialled back via `text-decoration-color` and goes solid on
hover.

The older `text-primary-700 dark:text-primary-400 underline` spelling is retired —
it was a hand-applied fix for a problem the palette now solves globally.

Links that are **not** in prose (nav items, breadcrumbs, card wrappers) are not
`.link`; they use `text-muted hover:text-default` or are `UButton`s per §2.

### 1.6 The light-mode contrast rule

Brand saffron and Nuxt UI's `subtle` badge text both fall below 4.5:1 on white.
This is solved **centrally and light-mode-only**, in `main.css`:

- `:root:not(.dark)` darkens `primary-300…950` and pins `--ui-text-muted` /
  `--ui-text-dimmed` one step darker.
- `.tint-{success,warning,error,info,herb}` utilities carry the
  `-700` light / `-400` dark text pairs for tinted pills and badges.

Dark mode keeps the base palette, which already contrasts. **Do not** re-fix
contrast at a call site with an inline `text-*-700 dark:text-*-400` — that is the
pattern this section replaces.

### 1.7 Elevation and motion

Shadows are for hover affordance only, never for static rank: `hover:shadow-lg`.
Transitions are `transition-colors` (150ms default) — the single exception is the
`[role=menu]` transition kill-switch in `main.css`, which exists to stop a
one-frame highlight flash on dropdown open.

---

## 2. Buttons

Nuxt UI's own defaults are already `size: 'md'`, `color: 'primary'`,
`variant: 'solid'`, so a default-rank primary button is `<UButton :label="…" />`
with **no** `size`, `color` or `variant`.

> **Do not restate those defaults in `app.config.ts`.** See §2.1 — it looks
> harmless and it breaks 44 library components.

Size is a function of **rank**, not of taste. Four sizes, no `xl`:

| Rank                                     | Props                                                            |
| ---------------------------------------- | ---------------------------------------------------------------- |
| Page CTA / form submit                   | `size="lg"` (+ `block` inside a form card)                       |
| Secondary beside a page CTA              | `size="lg" color="neutral" variant="subtle"`                     |
| Standard action (card footer, toolbar)   | _(no props)_                                                     |
| Cancel / dismiss **in a pair**           | `color="neutral" variant="subtle"`                               |
| Row action (list item, table cell)       | `size="sm" color="neutral" variant="outline"`                    |
| Icon-only micro (editor toolbar, remove) | `size="xs" color="neutral" variant="ghost"`                      |
| Nav item — idle                          | `color="neutral" variant="ghost"`                                |
| Nav item — current / emphasised          | `color="primary" variant="soft"`                                 |
| Footer / legal link                      | `size="xs" color="neutral" variant="ghost"`                      |
| Destructive trigger                      | `color="error" variant="outline"`                                |
| Destructive confirm (in a modal)         | `color="error"`                                                  |
| Toggle (filter chip, view switch)        | `size="sm"`, active `variant="solid"` / idle `variant="outline"` |

Rules:

- Buttons of the same rank in the same cluster carry the **same** size. A row of
  actions on the recipe header is all `sm`; a hero is all `lg`.
- Icon-only buttons **must** have `aria-label`.
- Never put `size` on a button whose rank is "standard" — that is the default.
- **Equal height is not enough — equal _weight_ matters (§2.2).**
- No decorative `shadow-*` on a button. A shadow makes a solid button bloom past
  its box, so an identically-sized neighbour reads smaller.

### 2.1 Never set `defaultVariants` for `button`, `badge` or `card`

`useComponentProps` resolves `appConfig.ui.<component>.defaultVariants` **before**
a component's own declared prop defaults. **44 Nuxt UI components internally
render a `UButton` or `UBadge`** and depend on those declared defaults — Modal's
close button, Pagination, Tabs, Toast, SelectMenu, InputMenu, Carousel,
`ColorModeButton`, …

So `button: { defaultVariants: { color: 'primary', variant: 'solid' } }` does not
merely set the app's default; it overrides all of them. It shipped briefly and
turned the header's theme toggle into a solid saffron block — `UColorModeButton`
declares `color: 'neutral', variant: 'ghost'`, and the app.config entry outranked
it.

What is safe in `app.config.ts`:

| Safe                                           | Why                                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| `slots` additions (`w-full` on form controls)  | Additive via tailwind-merge; a nested control also becoming full width is correct |
| `defaultVariants` on a component nothing nests | e.g. `alert` — nothing we use renders a nested `UAlert`                           |
| `colors` mapping                               | That is what it is for                                                            |

Our badges therefore state `color="neutral"` (and `variant="subtle"`) at the call
site. One extra prop is the price of not restyling every nested badge in the
library.

### 2.2 In a pair, the secondary needs a visible surface

Two buttons of identical height read as different sizes when only one has a
background: the eye measures the filled box on the solid and the text on the
ghost. `outline` sits in between — a 1px ring next to a saturated fill still reads
lighter, and therefore smaller.

So **whenever a secondary button sits directly beside a solid one** — header auth
pair, hero CTA pair, modal footer, GourMerge Request action cluster — the
secondary is `color="neutral" variant="subtle"`: a tinted box of equal visual
weight, unambiguously lower emphasis without looking smaller.

`ghost` remains correct for a button with **no filled neighbour**: nav items,
icon-only micro actions, footer links.

### 2.3 One height per cluster

Every control in a horizontal cluster is the same size, including non-buttons. The
header's locale switcher was `size="sm"` (28px) beside `md` buttons (32px) — a real
4px mismatch on top of the perceptual one. Form controls default to `md` (§3.2),
which matches `md` buttons, so the fix is to pass no `size` at all.

### 2.4 Interactive elements need a pointer cursor

Tailwind v3's preflight set `cursor: pointer` on `button`; **v4 removed it** and
defers to the browser default (`cursor: default`). After the v4 migration every
button in the app had lost its pointer while links kept theirs (from the UA
stylesheet), which read as "some things are clickable, some aren't".

`main.css` restores it in `@layer base` for `button:not(:disabled)`, `summary`, and
the interactive ARIA roles Reka UI renders on non-button elements — guarded so
Nuxt UI's `disabled:cursor-not-allowed` still wins, and in `base` so an explicit
`cursor-grab` / `cursor-help` utility still wins.

## 3. Form controls

### 3.1 Width is central, not per call site

`UInput` / `UTextarea` / `UInputMenu` / `UInputNumber` have an `inline-flex` root
and `USelect` / `USelectMenu` an `inline-flex` base, so out of the box they
collapse to content width. `app.config.ts` adds `w-full` to those slots **once**.

Consequence: **never write `class="w-full"` on a form control.** It is already
full width. To make one narrower, give it an explicit width — and only in the
places §3.4 allows.

### 3.2 One size

All form controls are `md`, set as `defaultVariants.size` in `app.config.ts`. No
call site passes `size` to a form control. The pre-refactor tree had auth and
contact at `lg` and everything else at `md`; `md` won on both count and on
looking correct next to an `md` button.

### 3.3 Structure

- Every control is wrapped in a `UFormField` with a `label`.
- `required` on `UFormField` mirrors the Zod schema — if the schema requires it,
  the label shows it.
- Validation comes from `UForm` + Zod. Do not hand-render error text.
- Vertical rhythm: `space-y-4` in a form; `space-y-6` when the form has visually
  grouped sections.
- Submit is the last child of the `UForm`: `size="lg" block`.
- A control that must be labelled but has no visible label (locale switcher,
  filter) carries `aria-label`.

### 3.4 The intrinsic-width exceptions

Only these may set an explicit width, because they sit in a horizontal cluster
rather than in a form column:

| Control                        | Width  |
| ------------------------------ | ------ |
| Header locale switcher         | `w-28` |
| Explore search input           | `w-64` |
| Explore filter selects         | `w-40` |
| Branch selector (history page) | `w-48` |

Anything else is full width.

---

## 4. Layout

### 4.1 The shell

`default`, `dashboard` and `auth` layouts are `flex flex-col h-dvh
overflow-hidden`. Header, footer and dashboard sidebar are `shrink-0`; **only
`<main>` scrolls** (`flex-1 overflow-y-auto`). `h-dvh`, never `h-screen`, so
mobile browser chrome is handled.

Layouts do **not** wrap page content. `<main>` is a bare scroll container. The
dashboard body row is full-width so the sidebar touches the left edge and
`<main>`'s scrollbar touches the right edge; content is capped **inside**
`<main>`, by the page. Capping the row instead leaves the scrollbar floating
mid-page on wide screens.

### 4.2 Content width — three values, one component

Every page's content lives in exactly one `<CommonPageShell>`:

| `width`   | Cap         | For                                           |
| --------- | ----------- | --------------------------------------------- |
| `form`    | `max-w-2xl` | Forms, legal prose, single-purpose pages      |
| `content` | `max-w-4xl` | Reading and detail views, timelines, glossary |
| `wide`    | `max-w-7xl` | Card grids, dashboards, explore, profiles     |

`wide` is deliberately `max-w-7xl` — the same cap as the header and footer, so a
grid page lines up with the nav above it.

Gutters are `px-4 sm:px-6 lg:px-8` and vertical padding `py-8 sm:py-10`, both
from the shell. This matters: the pre-refactor pages used a flat `px-4` while the
header used `px-4 sm:px-6 lg:px-8`, so content and nav were misaligned by up to
16px on desktop.

`spacing="none"` drops the vertical padding, for a page that manages its own
section rhythm. Only `index.vue` uses it.

Rules:

- Exactly one `<CommonPageShell>` per page, as the template root.
- **No `max-w-*` on a page root.** The shell owns it.
- **No `px-*` / `py-*` on a page root.** The shell owns it.
- Inner `max-w-*` on a paragraph or a modal body is fine — that is content
  measure, not page width.

### 4.3 Page header

`<CommonPageHeader>` renders the `h1`, the optional leading icon, the optional
subtitle, an optional back-link, and an `#actions` slot. It is the only place
`text-2xl sm:text-3xl font-bold` appears outside the landing page.

```html
<CommonPageHeader :title="t('nav.myRecipes')" :subtitle="t('dashboard.subtitle')" icon="i-lucide-book-open">
  <template #actions>
    <UButton :label="t('nav.newRecipe')" icon="i-lucide-plus" size="lg" to="/recipes/new" />
  </template>
</CommonPageHeader>
```

### 4.4 Grids

One card grid, everywhere:

```html
<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"></div>
```

The loading skeleton mirrors it exactly, with `USkeleton class="h-48 rounded-lg"`.

---

## 5. Cards

`variant="outline"` (the default). Body padding comes from the theme
(`p-4 sm:p-6`) — never overridden.

- A titled card uses `#header` with an `h2` at `text-lg font-semibold`, an
  optional `size-5 text-primary-500` leading icon, and an optional count
  `UBadge`.
- A card that is a link wraps in `NuxtLink` + `class="group"`; hover is
  `hover:border-primary-500/50` plus `hover:shadow-lg`.
- Never use a card purely for padding — use the shell.

---

## 6. Feedback states

### 6.1 Empty, error and "not found"

All three are `<CommonEmptyState>`. One layout, one `tone`:

```html
<CommonEmptyState
  icon="i-lucide-book-open"
  :title="t('dashboard.emptyTitle')"
  :description="t('dashboard.emptyDescription')"
>
  <template #actions>
    <UButton :label="t('dashboard.createFirst')" icon="i-lucide-plus" to="/recipes/new" />
  </template>
</CommonEmptyState>
```

`tone="neutral"` (default) renders the icon `text-dimmed`; `tone="error"` renders
it `text-error-500`. Both are a `UCard`, centred, `size-12` icon, `text-base
font-semibold` title, `text-muted` description, `md` action buttons.

The pre-refactor tree had two competing looks — a `UCard` with a `size-16` icon
and an `h2 text-xl`, and a bare centred `div` with a `size-12` icon at 40%
opacity. The card version won because it holds its shape inside a grid.

### 6.2 Loading

Skeletons, not spinners, for content that has a known shape. A spinner
(`i-lucide-loader-2 animate-spin text-primary-500`) is only for an action already
in flight inside a modal.

### 6.3 Toasts

Always through `useAppToast()` (`success` / `error`), never a raw `useToast().add`
— the wrapper is what keeps icon and colour consistent.

### 6.4 Confirmation

`UModal`, never `window.confirm` — Chromium suppresses it in automated contexts.
Footer is cancel (`color="neutral" variant="ghost"`) then confirm, right-aligned,
`gap-2`.

---

## 7. Badges and pills

Nuxt UI's own badge default is `primary`/`solid`, and it **must not** be changed
globally (§2.1), so our badges state their colour at the call site.

| Purpose             | Props                                                     |
| ------------------- | --------------------------------------------------------- |
| Count next to title | `color="neutral" variant="subtle"` + `:label="String(n)"` |
| State / status      | `:color` from the shared status map, `variant="subtle"`   |
| Difficulty          | `<RecipeDifficultyBadge>`                                 |
| Dietary type        | `<RecipeDietaryBadge>`                                    |
| Recipe tag (static) | `<RecipeTagList>`                                         |
| Tag filter (toggle) | `UButton size="xs"`, per §2's toggle row                  |

Status colours live in `app/utils/ui.ts` (`GMR_STATUS_COLOR`,
`DIFFICULTY_COLOR`) so the badge on the list page and the badge on the detail
page can't drift apart.

---

## 8. Icons

Lucide (`i-lucide-*`); `i-simple-icons-*` for brand marks.

| Context               | Size      |
| --------------------- | --------- |
| Inline with text      | `size-4`  |
| Card / section header | `size-5`  |
| Page header           | `size-6`  |
| Empty state           | `size-12` |

Decorative icons take `aria-hidden="true"`. An icon that carries meaning on its
own needs a label on its control.

---

## 9. Accessibility (non-negotiable)

- Every page reachable by keyboard; skip-link first in the layout.
- `<html lang>` follows the i18n locale.
- Comboboxes, icon-only buttons and unlabelled selects have `aria-label`.
- Focus: Nuxt UI's own ring on form controls and widgets; the global
  `:focus-visible` outline on everything else. `main.css` suppresses the global
  outline on native controls and Reka widget roles so nothing shows a doubled
  indicator.
- Contrast is handled by §1.6, centrally.
- The axe gate (`tests/e2e/a11y.spec.ts`) fails CI on any **critical** violation.
  It does **not** check consistency — that is what `design:check` is for.

---

## 10. i18n

- No user-facing literal in a template. Everything through `t()`.
- All four locales (de/en/fr/it) or the `i18n:check` gate fails.
- Never concatenate translated fragments; use interpolation.
- "GourMerge Request" is a brand term. **"Pull Request" / PR / `pull_request` /
  `pullRequest` are forbidden everywhere** — code, comments, copy, tests.

---

## 11. Enforcement

`npm run design:check` (in `lint`, and in CI before typecheck) fails on:

1. `[var(--ui-…)]` arbitrary classes → use the §1.2 utility.
2. Raw `amber-*` / `orange-*` / `yellow-*` / `red-*` / `green-*` / `lime-*` /
   `blue-*` utilities outside `main.css` → use the semantic ramp or a `--gm-*`
   token.
3. `class="w-full"` on a form control → it is already full width (§3.1).
4. `size=` on a form control → one size (§3.2).
5. `size="xl"` on a button → not in the scale (§2).
6. `max-w-*`, `px-*` or `py-*` on a page-template root → the shell owns it (§4.2).
7. A page whose template root is not `<CommonPageShell>` (landing and the
   dynamic-layout `explore` page are allow-listed).
8. `text-primary-700 dark:text-primary-400` → use `.link` (§1.5).
9. `pull request` / `pull_request` / `pullRequest` anywhere (§10).
10. `text-primary-<shade>` / `bg-primary-<shade>` as a **foreground or solid fill** →
    use the mode-aware `text-primary` / `bg-primary` (§1.1). Alpha tints
    (`bg-primary-500/10`) are allowed and are not flagged.
11. `defaultVariants` for `button`, `badge` or `card` in `app.config.ts` (§2.1).
12. A `<UBadge>` with no `color` → Nuxt UI's default is solid primary (§7).
13. A decorative `shadow-*` on a `<UButton>` (§2).

The checker is `scripts/design-check.mjs`. Its allow-lists are short and each
entry is commented with why. If you need to add one, that is a signal to change
this document first.

---

## 12. Change protocol

1. Change this document.
2. Change `app.config.ts` or `main.css`.
3. Only then change call sites — and only if the central change can't do it.
4. If the change makes a rule mechanically checkable, extend
   `scripts/design-check.mjs`.

A visual change that touches more than three files without touching `app.config.ts`
or `main.css` is almost certainly being made at the wrong level.
