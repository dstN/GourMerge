# GourMerge — Architecture & Project Rulebook

> **"Fork the recipe, merge the flavor."**
> _Deutsch: "Wo bester Geschmack verschmilzt."_

The **single source of truth** for all architectural decisions, naming conventions, and coding standards. Every contributor (including AI assistants) **must** follow these rules strictly.

See `.claude/current_state.md` for the current implementation status. See `.claude/ROADMAP.md` for the delivery plan.

---

## 1. Wording — Absolute Rule

> **The term "Pull Request" is FORBIDDEN in this codebase.**

In all code, UI labels, database columns, API endpoints, comments, commit messages, and documentation:

- ✅ **GourMerge Request** (display name)
- ✅ **gourmerge_request** (DB column / snake_case)
- ✅ **gourmergeRequest** (camelCase in code)
- ✅ **GourmergeRequest** (PascalCase for types/components)
- ❌ ~~Pull Request~~, ~~PR~~, ~~pullRequest~~, ~~pull_request~~

---

## 2. Tech Stack (fixed — do not substitute)

| Layer          | Technology                                                     |
| -------------- | -------------------------------------------------------------- |
| Framework      | **Nuxt 4** (Vue 3 Composition API)                             |
| UI Library     | **Nuxt UI v4** (Reka UI + Tailwind CSS v4 + Tailwind Variants) |
| Styling        | **Tailwind CSS v4** (CSS-first config via `@theme`)            |
| Database       | **MySQL 8.4** (exclusively — see note below)                   |
| ORM            | **Drizzle ORM** with `mysql2` driver                           |
| i18n           | **@nuxtjs/i18n** (lazy-loaded, DE default + EN + FR + IT)      |
| WYSIWYG Editor | **TipTap 3.x** with `@tiptap/markdown`                         |
| Text Diffing   | **diff-match-patch-es**                                        |
| PWA            | **@vite-pwa/nuxt**                                             |

> **Engine correction (2026-08-04).** This document previously specified MariaDB. In
> reality every environment is MySQL: production is `<db-host>` reporting
> **8.4.11**, local dev is a native MySQL, and only CI ran `mariadb:11` — so tests were
> the single MariaDB in the project. CI and `docker-compose.yml` are now pinned to
> `mysql:8.4`. This matters because the codebase issues engine-specific SQL:
> `JSON_UNQUOTE(JSON_EXTRACT(…))` for locale-aware ingredient names, a
> collation-sensitive `LIKE` in ingredient autocomplete, and `MATCH … AGAINST` for
> explore search. MariaDB implements `JSON` as `LONGTEXT` + CHECK, with different
> comparison, collation and full-text tokenizer behaviour from MySQL's native type.
> Keep every environment on MySQL 8.4; do not reintroduce MariaDB.

---

## 3. Nuxt 4 Directory Structure

```text
GourMerge/
├── .claude/                    # Team + AI reference docs
├── app/                        # ← ALL frontend source code lives here
│   ├── assets/css/main.css     # Tailwind v4 + Nuxt UI + custom tokens
│   ├── components/             # Auto-imported Vue components
│   │   ├── common/             # BrandLogo, GlossaryTerm, HelpHint
│   │   ├── layout/             # DashboardSidebar, UserDropdown
│   │   ├── onboarding/         # ConceptIntro, HelpMenu, TourOverlay, TourStep
│   │   └── recipe/             # IngredientAutocomplete, IngredientRow, StepEditor,
│   │                           # RecipeCard, RecipeDiffViewer, DietaryBadge, NutritionFacts
│   ├── composables/            # Auto-imported composables (useXxx)
│   ├── layouts/                # default.vue, dashboard.vue, auth.vue
│   ├── middleware/             # validate-recipe-route.ts, auth.ts
│   ├── pages/                  # File-based routing (23 pages)
│   ├── plugins/                # Vue/Nuxt plugins
│   ├── utils/                  # Auto-imported utility functions
│   ├── app.vue                 # Root: <UApp><NuxtLayout><NuxtPage />
│   └── app.config.ts           # Nuxt UI theme overrides
├── server/                     # ← Nitro server (API, DB, utils)
│   ├── api/                    # API route handlers (32 endpoints)
│   ├── database/
│   │   ├── schema.ts           # Drizzle ORM schema (17 tables)
│   │   └── migrations/         # Versioned SQL migrations (never use push in prod)
│   ├── middleware/             # Server middleware
│   ├── plugins/                # Nitro plugins (db init, logger, sentry)
│   └── utils/                  # drizzle.ts, diff.ts, merge.ts, units.ts, slug.ts
├── shared/                     # ← Shared between app/ and server/
│   └── types/                  # TypeScript type definitions
├── i18n/                       # i18n configuration
│   └── locales/                # de.json, en.json, fr.json, it.json
├── public/                     # Static assets (PWA icons, favicon)
├── scripts/                    # Maintenance + data import scripts
├── docs/                       # Operational documentation
├── nuxt.config.ts              # Nuxt configuration (CSP, i18n, PWA, runtime config)
├── drizzle.config.ts           # Drizzle Kit config
├── docker-compose.yml          # LOCAL DEV ONLY — MySQL 8.4
└── app.js                      # Passenger startup shim
```

### Key Rules

- **Never** put Vue components, pages, or composables outside `app/`.
- **Never** put server logic inside `app/`.
- **Shared types** go in `shared/types/` — auto-imported by both `app/` and `server/`.
- **i18n locale files** live in `i18n/locales/` (not `app/locales/`).
- **`server/utils/`** files are auto-imported in server context only.

---

## 4. Vue 3 Composition API — Strict Rules

### Mandatory

- Use `<script setup lang="ts">` in all components. No exceptions.
- Use `defineProps` / `defineEmits` / `defineModel` with TypeScript types.
- Use `ref()`, `computed()`, `watch()` — never `this`.
- Use Nuxt auto-imports: `useRoute()`, `useFetch()`, `useAsyncData()`, `useState()`, etc.

### Forbidden

- ❌ Options API (`data()`, `methods`, `computed` as object)
- ❌ `defineNuxtComponent()`
- ❌ `export default { ... }` component definitions
- ❌ Mixins

---

## 5. Nuxt UI v4 — Component Rules

### Prefix

All Nuxt UI components use the `U` prefix: `<UButton>`, `<UCard>`, `<UTabs>`, `<UBadge>`, etc.

### Root wrapper

`app.vue` must wrap everything in `<UApp>`:

```vue
<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
```

### Theming

- Use the `@theme` block in `main.css` for design tokens (CSS variables).
- Override component themes in `app.config.ts` via Tailwind Variants API.
- **Never** use inline styles for theming.

### Icons

Use Iconify icons via the `icon` prop: `<UButton icon="i-lucide-git-fork" />`.

### USelect (v4 API)

```html
<!-- CORRECT — v4 uses :items and value-key -->
<USelect v-model="val" :items="options" value-key="value" />

<!-- WRONG — v3 API, does not work in v4 -->
<USelect v-model="val" :options="options" />
```

Object arrays require `value-key="value"`. Empty string option values cause falsy-value mismatches — use a sentinel string (e.g. `'none'`) for "unselected".

### UDropdownMenu items

```typescript
// Navigation: use to: for routing
{ label: 'My Recipes', icon: 'i-lucide-book-open', color: 'neutral' as const, to: '/recipes' }

// Actions: use click: for callbacks
{ label: 'Logout', icon: 'i-lucide-log-out', color: 'neutral' as const, click: handleLogout }
```

Always include `color: 'neutral' as const` — missing it causes an icon colour flash on hover.

### UModal for confirmations

**Never use `window.confirm`** — it is suppressed silently by Chromium in dev environments (always returns `false`, blocking navigation). Use `UModal` with an `allowLeave` flag pattern instead:

```typescript
const showModal = ref(false)
const allowLeave = ref(false)

onBeforeRouteLeave((to, from, next) => {
  if (!isDirty.value || allowLeave.value) {
    allowLeave.value = false
    next()
    return
  }
  pendingRoute.value = to.fullPath
  showModal.value = true
  next(false)
})
```

---

## 6. MySQL & Drizzle ORM — Best Practices

### Schema Design

- All tables use `snake_case` column names.
- Primary keys: `INT AUTO_INCREMENT` (internal only — never expose in URLs/API).
- External identifiers: `BINARY(16)` UUIDv7 `public_id` column on externally-linked entities (`recipes`, `gourmerge_requests`). Generated app-side via `uuidv7` package.
- **Auth tokens** (`email_verification_tokens`, `password_reset_tokens`) use **CSPRNG**, NOT UUIDv7. Store bcrypt hash, never plaintext.
- Timestamps: `created_at DATETIME`, `updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`.
- Use `TEXT` for Markdown content, `JSON` for structured metadata.

### Versioning (Git-like) Performance Rules

1. **Snapshot-based commits**: each commit stores a full snapshot of ingredients + steps. Never delta encoding.
2. **Branch = Pointer**: a branch row points to `head_commit_id`. Creating a branch is 1 INSERT.
3. **Commit DAG**: `parent_commit_id` creates a linked list. Traverse application-side. (The original rule said "no recursive CTEs, slow on MariaDB"; production is MySQL 8.4, where recursive CTEs are perfectly serviceable. The app-side walk stays because it is built, paginated and proven — not because CTEs are unavailable. Do not rewrite it without a measured reason.)
4. **Diffs are computed on-read**: compare two commit snapshots at query time. Never pre-store diffs.
5. **Indexing**: always index `branch_id`, `parent_commit_id`, `commit_id` (on ingredient/step tables), and `source_branch_id` / `target_branch_id` on GourMerge Requests.

### FK Cascade Design

Most FK relations use `onDelete: 'cascade'`. Two relations use NO ACTION (= RESTRICT in MySQL) and must be handled explicitly in the delete handler:

- `recipes.forked_from_recipe_id` — nullify on forks before deleting parent
- `gourmerge_requests.source_branch_id / target_branch_id / source_recipe_id` — delete cross-recipe GMRs before branch cascade

See `server/api/recipes/[id].delete.ts` for the implementation.

### Denormalized Counters

`recipes.starCount` and `recipes.forkCount` are denormalized. Always update them in the **same transaction** as the star/fork insert. Run `scripts/reconcile-counters.mjs` to repair drift.

### Connection

- Use `mysql2` with connection pooling. Pool size ≈ 3–5 for shared Netcup hosting (Passenger spawns multiple processes — each has its own pool).
- DB URL from `runtimeConfig.databaseUrl` (never hardcode).

---

## 7. i18n — Internationalization Rules

### Setup

- Module: `@nuxtjs/i18n` with lazy loading.
- **4 locales**: `de` (default), `en`, `fr`, `it`.
- Locale files: `i18n/locales/{de,en,fr,it}.json`.
- Strategy: `prefix_except_default` (German has no prefix, others get `/en/`, `/fr/`, `/it/`).

### CI Gate

`npm run i18n:check` (`scripts/i18n-check.mjs`) enforces 4-way parity:

- All 4 locale files must have identical key sets
- No key may have an empty value in any locale
- Run after every string change

### What gets translated

- ✅ All UI labels, buttons, navigation, form labels, error messages, toasts
- ✅ Onboarding, glossary, legal pages
- ✅ Auth flow strings (verification emails, reset)
- ❌ User-generated recipe content (stays in author's language)

### Usage in components

```vue
<script setup lang="ts">
const { t, locale } = useI18n()
</script>
<template>
  <UButton :label="t('actions.save')" />
</template>
```

---

## 8. WYSIWYG / Markdown Handling

### Editor

- TipTap 3.x with `@tiptap/vue-3` + `@tiptap/starter-kit` + `@tiptap/markdown`.
- Always use `immediatelyRender: false` for SSR safety (prevents hydration mismatch).
- Wrap in `<ClientOnly>` with a plain-text fallback.
- **Images are disabled** — no image extension, no `img::` upload track.

### Empty state normalization

TipTap's empty state is `'<p></p>'`, not `''`. Always normalize before comparing:

```typescript
const isEmpty = (s: string) => !s || s === '<p></p>' || s === '<p><br></p>'
if (isEmpty(newVal) && isEmpty(currentHtml)) return
```

Failing to do this causes constant `setContent()` calls that reset the cursor on every keystroke.

### Storage

- Recipe steps stored as **Markdown strings** in `recipe_commit_steps.content`.
- One row per step (ordered by `sort_order`).
- Step translations stored as JSON in `recipe_commit_steps.content_translations` (`{ "de": "...", "fr": "..." }`).

### Rendering

- For display, render Markdown → HTML via `marked` or TipTap static renderer.
- For diff view, compare raw Markdown strings.

---

## 9. Unit Normalization

### Database Rule

The database stores **only metric canonical values**:

- Mass: `grams` (`g`)
- Volume: `milliliters` (`ml`)
- Countable: `piece`, `pinch`, `tsp`, `tbsp`

### Conversion

- Conversion happens in `server/utils/units.ts`.
- User measurement preference stored in `users.preferred_measurement_system` (`metric` / `imperial`).

---

## 10. Ingredient Data

- The global `ingredients` master table is populated from the **Swiss BLV Food Composition Database V7.0**.
- Nutrition stored in `ingredient_nutrition` (per 100g/100ml, edible portion).
- `ingredient_nutrition.source` identifies origin: `'swiss-blv-v7'` or `'curated'`.
- Search via `GET /api/ingredients?q=&locale=` — matches name + locale-specific synonyms.
- Ingredients missing from Swiss BLV can be added to `scripts/seed-ingredients.mjs` with `source = 'curated'`.

---

## 11. API Design

### Route Conventions

- REST-style: `GET /api/recipes`, `POST /api/recipes`, `GET /api/recipes/:id`
- Nested: `GET /api/recipes/:id/branches`, `GET /api/recipes/:id/commits`
- GourMerge Requests: `GET /api/recipes/:id/gourmerge-requests`

### Every endpoint must

1. Validate body/query with **Zod** — reject unknown keys, enforce length caps matching DB
2. Use `requireUserSession(event)` for authenticated routes
3. Return `createError()` for all error cases — never throw raw errors
4. Check ownership before any mutation (`recipe.ownerId !== session.user.id` → 403)
5. Use `useDrizzle()` — null-guard before any DB operation

### Response format

Return typed plain objects. No wrapper `{ data: ... }` envelope.

---

## 12. Security Rules

- **Rate limiting**: DB-backed (`rate_limit_hits` table) — in-memory state is NOT multi-process safe under Passenger
- **CSRF**: enabled via nuxt-auth-utils / Nitro
- **Session rotation**: regenerate after login/register
- **Cookies**: `httpOnly`, `sameSite=lax`, 14-day maxAge; `secure` in production
- **Markdown sanitization**: user-provided Markdown is rendered via `marked` — never inject as raw HTML without sanitization
- **No stack traces in production**: Nitro error hook sanitizes responses
- **Secrets**: injected via Passenger env directives — never committed, never in `docker-compose.yml`

---

## 13. Git Workflow (Actual Git)

- Main branch: `master` (production target)
- Feature branches: `feature/<name>`
- Commit messages: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`)
- **Never add `Co-Authored-By` trailers to commit messages**
