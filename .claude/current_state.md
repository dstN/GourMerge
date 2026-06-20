# GourMerge — Ground Truth (June 2026)

> Single document of current project state. Updated as features ship.
> For future plans see `ROADMAP.md`. For architectural rules see `ARCHITECTURE.md`. For ops see `docs/RUNBOOK.md`.

---

## 1. What GourMerge Is

A git-like recipe platform. Recipes are repositories with branches, snapshot commits, diffs, forks, and **GourMerge Requests** (the project's mandatory term — "Pull Request" / PR / `pull_request` are forbidden everywhere).

- Slogan: "Fork the recipe, merge the flavor." / DE: "Wo bester Geschmack verschmilzt."
- Target: German-speaking home cooks who want to collaborate on recipes.
- Languages: DE (default), EN, FR, IT — all 4 at full parity.

---

## 2. Tech Stack (fixed — do not substitute)

| Layer         | Technology                                     | Version       |
| ------------- | ---------------------------------------------- | ------------- |
| Framework     | Nuxt 4                                         | ^4.0.0        |
| UI            | Nuxt UI v4 (Reka UI + Tailwind CSS v4)         | ^4.0.0        |
| Database      | MariaDB via Drizzle ORM (mysql2)               | drizzle ^0.45 |
| Auth          | nuxt-auth-utils (session-based)                | ^0.5.0        |
| i18n          | @nuxtjs/i18n                                   | ^9.0.0        |
| Editor        | TipTap 3 + @tiptap/markdown                    | ^3.0.0        |
| Diff          | diff-match-patch-es                            | ^0.1.0        |
| PWA           | @vite-pwa/nuxt                                 | ^0.10.0       |
| Observability | Pino + @sentry/nuxt                            | ^10 / ^13     |
| Deployment    | Netcup Webhosting + Phusion Passenger (Apache) | —             |

---

## 3. Repository Layout

```
GourMerge/
├── app/                        # All frontend source (Nuxt 4 convention)
│   ├── assets/css/main.css     # Tailwind v4 @theme + custom tokens
│   ├── components/             # Auto-imported Vue components
│   │   ├── common/             # BrandLogo, GlossaryTerm, HelpHint
│   │   ├── layout/             # DashboardSidebar, UserDropdown
│   │   ├── onboarding/         # ConceptIntro, HelpMenu, TourOverlay, TourStep
│   │   └── recipe/             # IngredientAutocomplete, IngredientRow, StepEditor,
│   │                           # RecipeCard, RecipeDiffViewer, DietaryBadge, NutritionFacts
│   ├── layouts/                # default.vue, dashboard.vue, auth.vue
│   ├── middleware/             # validate-recipe-route.ts, auth.ts
│   ├── pages/                  # 23 pages (see §5)
│   ├── app.vue                 # <UApp><NuxtLayout><NuxtPage />
│   └── app.config.ts           # Nuxt UI theme overrides
├── server/
│   ├── api/                    # 32 REST endpoints (see §6)
│   ├── database/
│   │   ├── schema.ts           # Drizzle ORM schema (17 tables)
│   │   └── migrations/         # 7 versioned SQL migrations (0000–0006)
│   ├── middleware/             # Nitro middleware
│   ├── plugins/                # Nitro plugins (db, logger, sentry)
│   └── utils/                  # drizzle.ts, diff.ts, merge.ts, units.ts, slug.ts
├── shared/types/               # TypeScript types shared app ↔ server
├── i18n/locales/               # de.json, en.json, fr.json, it.json (377 keys, 4-way parity)
├── scripts/                    # Maintenance + setup scripts (see §8)
├── public/                     # PWA icons, favicon, apple-touch-icon
├── docs/RUNBOOK.md             # Production operations playbook
├── .claude/                    # AI + team reference docs
├── nuxt.config.ts              # Main config (CSP, i18n, PWA, runtime config)
├── drizzle.config.ts           # Drizzle Kit config
├── docker-compose.yml          # LOCAL DEV ONLY — MariaDB
└── app.js                      # Passenger startup shim → .output/server/index.mjs
```

---

## 4. Database Schema (17 tables)

All migrations versioned in `server/database/migrations/`. **Never use `db:push` against production.**

| Table                       | Purpose                                     | Key Relations                        |
| --------------------------- | ------------------------------------------- | ------------------------------------ |
| `users`                     | Auth + profile                              | —                                    |
| `ingredients`               | Global master catalog (Swiss BLV)           | 1:1 → `ingredient_nutrition`         |
| `ingredient_nutrition`      | Per-100g nutritional data (Swiss BLV V7.0)  | —                                    |
| `recipes`                   | Repository equivalent                       | owner → `users`; forkedFrom → self   |
| `recipe_tags`               | Recipe ↔ tag M:M                            | CASCADE on recipe delete             |
| `tags`                      | Tag master list                             | —                                    |
| `recipe_stars`              | Favorites (unique per user+recipe)          | CASCADE on recipe delete             |
| `recipe_branches`           | Lightweight branch pointer                  | CASCADE on recipe delete             |
| `recipe_commits`            | Full snapshot per commit (not deltas)       | CASCADE on branch delete             |
| `recipe_commit_ingredients` | Ingredient snapshot per commit              | CASCADE on commit delete             |
| `recipe_commit_steps`       | Step (Markdown) snapshot per commit         | CASCADE on commit delete             |
| `gourmerge_requests`        | GMR (cross-branch/fork proposals)           | CASCADE on recipe delete (recipe_id) |
| `gm_request_comments`       | Comments on GMRs                            | CASCADE on GMR delete                |
| `email_verification_tokens` | CSPRNG tokens (bcrypt-hashed)               | CASCADE on user delete               |
| `password_reset_tokens`     | CSPRNG tokens (bcrypt-hashed)               | CASCADE on user delete               |
| `rate_limit_hits`           | DB-backed rate limiter (multi-process safe) | —                                    |
| `contact_messages`          | Contact form submissions                    | —                                    |

### FK cascade gaps (manually handled in API)

Two FKs use NO ACTION (= RESTRICT in MariaDB) and require pre-delete cleanup:

- `recipes.forked_from_recipe_id` — forks nullified before parent delete
- `gourmerge_requests.source_branch_id / target_branch_id / source_recipe_id` — cross-recipe GMRs deleted before branch cascade

This is handled in `server/api/recipes/[id].delete.ts`.

### Key schema decisions

- **Snapshot commits**: each commit stores a full ingredient + step snapshot. No delta encoding. Diffs computed on-read.
- **Branch = pointer**: a branch row points to `head_commit_id`. Creating a branch is 1 INSERT.
- **INT PK internal, UUIDv7 external**: `recipes` and `gourmerge_requests` have a `public_id BINARY(16)` (UUIDv7) for external URLs/API — internal JOINs use INT PKs. Auth tokens use CSPRNG, NOT UUIDv7.
- **Metric-canonical units**: DB stores `g` / `ml` / `piece` / `pinch` / `tsp` / `tbsp` only. Display conversion in `server/utils/units.ts`.
- **No recursive CTEs**: commit DAG traversal is done application-side (`parentCommitId` walk). MariaDB CTEs are slow.
- **Explore search**: FULLTEXT index on `recipes(title, description)` (migration `0006`, hand-authored — Drizzle's mysql `index()` can't express FULLTEXT). `explore.get.ts` uses `MATCH … AGAINST` for queries ≥ 3 chars, `LIKE` fallback for shorter terms.

---

## 5. Pages (25)

| Route                                           | Page                                  | Auth        | Layout    |
| ----------------------------------------------- | ------------------------------------- | ----------- | --------- |
| `/`                                             | Landing                               | No          | default   |
| `/dashboard`                                    | My dashboard                          | Yes         | dashboard |
| `/recipes`                                      | My recipes list                       | Yes         | dashboard |
| `/recipes/new`                                  | Create recipe                         | Yes         | dashboard |
| `/recipes/starred`                              | Starred recipes list                  | Yes         | dashboard |
| `/explore`                                      | Public discovery (search/filter/sort) | No          | default\* |
| `/[username]`                                   | User public profile                   | No          | default   |
| `/[username]/[slug]`                            | Recipe detail                         | No          | default   |
| `/[username]/[slug]/edit`                       | Recipe editor (TipTap + ingredients)  | Yes (owner) | dashboard |
| `/[username]/[slug]/branches`                   | Branch management                     | Yes (owner) | dashboard |
| `/[username]/[slug]/history`                    | Commit history timeline               | No          | dashboard |
| `/[username]/[slug]/forks`                      | List of recipes forked from this one  | No          | default   |
| `/[username]/[slug]/gourmerge-requests`         | GMR list                              | No          | dashboard |
| `/[username]/[slug]/gourmerge-requests/new`     | Create GMR                            | Yes         | dashboard |
| `/[username]/[slug]/gourmerge-requests/[gmrId]` | GMR detail + merge                    | No          | dashboard |
| `/auth/login`                                   | Login                                 | No          | auth      |
| `/auth/register`                                | Register                              | No          | auth      |
| `/auth/verified`                                | Email verification confirmation       | No          | auth      |
| `/auth/forgot-password`                         | Password reset request                | No          | auth      |
| `/auth/reset-password`                          | Password reset confirm                | No          | auth      |
| `/settings`                                     | Profile + locale + measurement prefs  | Yes         | dashboard |
| `/help/glossary`                                | Git-term cooking alias glossary       | No          | default   |
| `/legal/contact`                                | Contact form                          | No          | default   |
| `/legal/impressum`                              | Legal notice                          | No          | default   |
| `/legal/datenschutz`                            | Privacy policy                        | No          | default   |

\* `/explore` uses a **dynamic layout** (`definePageMeta({ layout: false })` + `<NuxtLayout :name="loggedIn ? 'dashboard' : 'default'">`): logged-in users get the dashboard shell with sidebar; guests get the public layout.

---

## 6. API Routes (34 endpoints)

All routes: Zod-validated body/query, `requireUserSession()` where auth required, `createError()` for errors.

### Auth / Users

| Method | Route                   | Auth | Purpose            |
| ------ | ----------------------- | ---- | ------------------ |
| GET    | `/api/users/[username]` | No   | Public profile     |
| PATCH  | `/api/users/me`         | Yes  | Update own profile |

### Ingredients

| Method | Route              | Auth | Purpose                                 |
| ------ | ------------------ | ---- | --------------------------------------- |
| GET    | `/api/ingredients` | Yes  | Search (q + locale) — Swiss BLV catalog |
| POST   | `/api/ingredients` | Yes  | Create ingredient on-the-fly (deduped)  |

### Recipes

| Method | Route                                    | Auth        | Purpose                                             |
| ------ | ---------------------------------------- | ----------- | --------------------------------------------------- |
| GET    | `/api/recipes`                           | Yes         | Own recipes list                                    |
| GET    | `/api/recipes/starred`                   | Yes         | Recipes the viewer has starred (card shape)         |
| POST   | `/api/recipes`                           | Yes         | Create recipe (transactional: recipe+branch+commit) |
| GET    | `/api/recipes/explore`                   | No          | Public browse (search/filter/sort/paginate)         |
| GET    | `/api/recipes/by-slug/[username]/[slug]` | No          | Fetch by URL slug (incl. resolved `forkedFrom`)     |
| GET    | `/api/recipes/[id]`                      | No          | Fetch by internal ID                                |
| PATCH  | `/api/recipes/[id]`                      | Yes (owner) | Update metadata                                     |
| DELETE | `/api/recipes/[id]`                      | Yes (owner) | Delete + cascade cleanup                            |
| POST   | `/api/recipes/[id]/fork`                 | Yes         | Deep-copy fork **incl. full commit history**        |
| GET    | `/api/recipes/[id]/forks`                | No          | List recipes forked from this one                   |
| POST   | `/api/recipes/[id]/star`                 | Yes         | Toggle star                                         |
| POST   | `/api/recipes/[id]/tags`                 | Yes (owner) | Set tags                                            |

### Branches / Commits

| Method | Route                                            | Auth        | Purpose                    |
| ------ | ------------------------------------------------ | ----------- | -------------------------- |
| GET    | `/api/recipes/[id]/branches`                     | No          | List branches              |
| POST   | `/api/recipes/[id]/branches`                     | Yes (owner) | Create branch              |
| DELETE | `/api/recipes/[id]/branches/[branchId]`          | Yes (owner) | Delete branch              |
| GET    | `/api/recipes/[id]/branches/[branchId]/snapshot` | No          | Current snapshot on branch |
| GET    | `/api/recipes/[id]/branches/compare`             | No          | Compare two branch heads   |
| GET    | `/api/recipes/[id]/commits`                      | No          | Commit history             |
| POST   | `/api/recipes/[id]/commits`                      | Yes (owner) | Create snapshot commit     |
| GET    | `/api/recipes/[id]/diff`                         | No          | Diff between two commits   |

### GourMerge Requests

| Method | Route                                                   | Auth        | Purpose                 |
| ------ | ------------------------------------------------------- | ----------- | ----------------------- |
| GET    | `/api/recipes/[id]/gourmerge-requests`                  | No          | List GMRs               |
| POST   | `/api/recipes/[id]/gourmerge-requests`                  | Yes         | Create GMR              |
| GET    | `/api/recipes/[id]/gourmerge-requests/[gmrId]`          | No          | GMR detail with diff    |
| PATCH  | `/api/recipes/[id]/gourmerge-requests/[gmrId]`          | Yes         | Status transitions      |
| POST   | `/api/recipes/[id]/gourmerge-requests/[gmrId]/comments` | Yes         | Add comment             |
| POST   | `/api/recipes/[id]/gourmerge-requests/[gmrId]/merge`    | Yes (owner) | Execute three-way merge |

### Misc

| Method | Route          | Auth | Purpose                         |
| ------ | -------------- | ---- | ------------------------------- |
| GET    | `/api/tags`    | No   | All tags                        |
| POST   | `/api/contact` | No   | Contact form submission         |
| GET    | `/api/health`  | No   | Health check (`{ status, db }`) |

---

## 7. i18n Status

- **4 locales**: `de` (default), `en`, `fr`, `it`
- **Strategy**: `prefix_except_default` — German has no prefix; `/en/`, `/fr/`, `/it/` prefixed
- **Key count**: 377 keys, 4-way parity (verified by `npm run i18n:check`)
- **Locale files**: `i18n/locales/{de,en,fr,it}.json`
- **CI gate**: `scripts/i18n-check.mjs` — fails if any locale has a missing key or empty value
- **Translated**: all UI labels, navigation, errors, toasts, onboarding, glossary, legal pages, auth flows
- **Not translated**: user-generated recipe content (stays in author's language)

---

## 8. Scripts

| Script                         | NPM command                                 | Purpose                                             |
| ------------------------------ | ------------------------------------------- | --------------------------------------------------- |
| `i18n-check.mjs`               | `npm run i18n:check`                        | 4-way locale parity gate                            |
| `import-swiss-foods.mjs`       | `npm run seed:swiss`                        | Import Swiss BLV Food Composition DB V7.0           |
| `seed-ingredients.mjs`         | `npm run db:seed`                           | Curated ingredient entries (not in Swiss BLV)       |
| `cleanup-seed-ingredients.mjs` | `node scripts/cleanup-seed-ingredients.mjs` | Remove non-BLV ingredients not used in any recipe   |
| `seed-tags.mjs`                | —                                           | Seed default recipe tags                            |
| `reconcile-counters.mjs`       | —                                           | Repair denormalized star/fork counters (idempotent) |
| `generate-icons.mjs`           | `npm run generate:icons`                    | Generate PWA/favicon assets from brand SVG          |

---

## 9. Ingredient Data

The `ingredients` master table is populated from the **Swiss BLV Food Composition Database V7.0** (naehrwertdaten.ch).

- ~2300+ Swiss food entries with DE/FR/IT names and synonyms
- Nutrition data per 100g (kcal, macros, fiber, micros) in `ingredient_nutrition`
- Source marker: `ingredient_nutrition.source = 'swiss-blv-v7'`
- Locale-aware search: name + synonyms matched by user's locale (`GET /api/ingredients?q=&locale=`)
- Curated entries (not in Swiss DB) can be added to `seed-ingredients.mjs` with `source = 'curated'`
- **Vanilla Sugar** (`Vanillezucker`): not in Swiss BLV DB — added as a curated entry in `seed-ingredients.mjs` (apply with `npm run db:seed`)

---

## 10. Security Implementation

| Measure                   | Status   | Notes                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rate limiting             | ✓ Done   | DB-backed (`rate_limit_hits` table) — multi-process safe for Passenger                                                                                                                                                                                                                                                         |
| CSRF                      | ✓ Done   | nuxt-auth-utils / Nitro                                                                                                                                                                                                                                                                                                        |
| Session rotation          | ✓ Done   | Post-login session regeneration                                                                                                                                                                                                                                                                                                |
| Secure cookies            | ✓ Done   | `httpOnly`, `sameSite=lax`, 14-day maxAge                                                                                                                                                                                                                                                                                      |
| Email verification        | ✓ Done   | CSPRNG token + bcrypt hash + SMTP send                                                                                                                                                                                                                                                                                         |
| Password reset            | ✓ Done   | CSPRNG token + bcrypt hash + expiry + no-enumeration response                                                                                                                                                                                                                                                                  |
| Zod validation            | ✓ Done   | All endpoint bodies + query params                                                                                                                                                                                                                                                                                             |
| Authorization             | ✓ Done   | Ownership checks on all mutating routes                                                                                                                                                                                                                                                                                        |
| CSP                       | ✓ Done   | Set per-request in `server/plugins/csp.ts` (`render:html` hook), not `routeRules` — allows TipTap inline styles, Sentry, Google Fonts                                                                                                                                                                                            |
| Security headers          | ✓ Done   | X-Content-Type-Options, X-Frame-Options, Referrer-Policy                                                                                                                                                                                                                                                                       |
| HSTS                      | ✓ Done   | Enabled in production via `routeRules` (baked when `NODE_ENV=production`): 1y max-age + includeSubDomains. Local HTTP dev unaffected. `.htaccess` also forces HTTP→HTTPS                                                                                                                                                       |
| Email-verification gating | ✓ Done   | `requireVerifiedUser` wired into GMR creation + recipe publish (create/patch to public); no-op unless `REQUIRE_EMAIL_VERIFICATION=true`                                                                                                                                                                                        |
| Markdown sanitization     | ✓ Done   | User step HTML/Markdown sanitized via allowlist (`app/utils/markdown.ts`) before `v-html`                                                                                                                                                                                                                                      |
| Error sanitization        | ✓ Done   | Verified: Nitro prod handler returns generic `"Server Error"` (no message/data/stack) for unhandled errors; only intentional `createError` 4xx keep `statusMessage`/`data` (e.g. Zod field errors). `error-handler.ts` logs 5xx + sets `x-request-id` for correlation                                                          |
| CSP `script-src` nonce    | ✓ Done   | Production drops `'unsafe-inline'` from `script-src`; every inline `<script>` gets a per-request nonce (`script-src 'self' 'nonce-…'`). Dev keeps `'unsafe-inline'` (Vite/HMR). Verified against a prod build: 0 CSP violations, app hydrates, color-mode FOUC guard runs                                                          |
| `npm audit`               | ✓ Done   | CI fails on **critical** advisories; Dependabot (`.github/dependabot.yml`) proposes high/moderate fixes as CI-validated PRs. drizzle-orm upgraded to ≥0.45.2 (SQL-identifier injection fix). Known accepted highs: `xlsx` (dev-only import script), `nodemailer` raw-option (unused), `vite`/`esbuild` dev-server (transitive) |

---

## 11. Observability

| Layer              | Tool                       | Config                                                                                                                                                                            |
| ------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structured logging | Pino → rotating file       | `server/utils/logger.ts`; rotates at 10 MB or daily, keeps 7 gzipped files via `rotating-file-stream` (no worker thread); `LOG_LEVEL` env; redacts cookies/auth                   |
| Error tracking     | Sentry.io (`@sentry/nuxt`) | Client + server auto-capture of unhandled errors; `autoInjectServerSentry: 'top-level-import'` (unconditional) so the CI-built artifact ships server capture; DSN/release via env |
| Health check       | `GET /api/health`          | Returns `{ status: "ok", db: "ok" }` or 503                                                                                                                                       |
| Uptime monitoring  | UptimeRobot (external)     | Polls `/api/health` — configure manually                                                                                                                                          |

---

## 12. Feature Implementation Status

### ✓ Complete

- **Auth**: register, login, logout, email verification, password reset, session rotation, rate limiting
- **Recipe CRUD**: create (transactional), read, update metadata, delete (with FK cleanup)
- **Editor**: TipTap 3 WYSIWYG (no images), step translations (DE/EN/FR/IT per step), Markdown output
- **Ingredients**: autocomplete from Swiss BLV catalog, create-on-the-fly, locale-aware search
- **Nutrition**: per-serving and total nutrition facts panel (kcal, macros, fiber, micros)
- **Branches**: list, create, delete (protected: default branch cannot be deleted)
- **Commits**: snapshot create, history timeline, snapshot restore on branch
- **Diffs**: between any two commits (ingredient + step word-level diff)
- **Fork**: deep-copy recipe + branches + head commit snapshot, forkCount++
- **Stars**: toggle star/unstar with starCount counter (atomic)
- **Tags**: attach/detach, filter in explore
- **Explore**: public browse with text search, difficulty/tag filter, sort (stars/newest/forks), pagination
- **User profiles**: public profile (recipes, starred, bio, avatar), settings page
- **GourMerge Requests**: full lifecycle — create, list, view with diff, comment (Markdown), status (draft→open→closed/merged), three-way snapshot merge with conflict detection + **interactive per-conflict resolution** (keep source/target), merge commit. Merge is transactional with a `SELECT … FOR UPDATE` guard against concurrent double-merge; merged ingredient `sortOrder` is normalized
- **i18n**: 4 locales (DE/EN/FR/IT), 377 keys in parity, 4-way CI gate — incl. transactional emails (verification + password reset) localized per recipient's `preferredLocale`
- **Onboarding**: concept explainer, interactive skippable/re-runnable tour, guided first-recipe flow, contextual help (`<HelpHint>`), glossary page
- **Dirty-state guard**: edit page navigation guard via UModal (not `window.confirm` — suppressed in Chromium)
- **Delete recipe**: from edit page with confirmation modal; cascade handles all FK cleanup
- **Layout**: default (header nav + footer), dashboard (sidebar + max-w-7xl header/footer), auth (minimal)
- **PWA**: icons generated, manifest configured, autoUpdate service worker
- **Observability**: Pino logging (⚠ file rotation + Sentry active capture not yet wired — see §11), /api/health endpoint
- **Security headers/CSP**: configured in nuxt.config.ts routeRules
- **Markdown sanitization**: user step content sanitized via allowlist before `v-html` (`app/utils/markdown.ts`)
- **Brand**: GourMerge SVG logo (`BrandLogo.vue`), orange primary color, DM Sans + JetBrains Mono fonts

### ✗ Not yet done

- **Tests**: **unit** — 118 cases (`tests/unit/`: diff, merge incl. resolution, units, slug, uuid, nutrition, markdown-XSS, emailI18n, i18n-gate), 97% line coverage enforced in CI. **E2E/API/a11y** — 24 Playwright specs (`tests/e2e/`): auth lifecycle + authz matrix, recipe CRUD/fork/star, merge conflict-detect → interactive resolve → verify → immutable, SSR render, register UI journey, and axe scans (critical-gated). Run via `npm run test:e2e` + the `E2E` workflow on master. Dedicated component-mount tests not added — covered functionally by the E2E journeys
- **CI/CD**: GitHub Actions **are configured** — `ci.yml` (lint → format → typecheck → i18n → migrate → test → build) and `deploy.yml` (rsync → migrate → restart → smoke test). Not yet: coverage enforcement, `npm audit` gate
- **Passenger CD**: `.htaccess` + `app.js` exist and `deploy.yml` **does** wire rsync + migrate + `touch tmp/restart.txt` + health smoke test. Not yet: migrate exit-code check, production environment protection
- **Dependabot / npm audit CI gate**: not configured

---

## 13. Known Quirks and Non-Obvious Decisions

- **`window.confirm` is suppressed in Chromium dev environments** — always use `UModal` for async confirmations. Replaced in edit page (`onBeforeRouteLeave`).
- **USelect in Nuxt UI v4** uses `:items` (not `:options`) and requires `value-key="value"` to bind object arrays correctly.
- **TipTap SSR**: `@tiptap/vue-3` v3 `useEditor` has **no** `immediatelyRender` option (passing it fails typecheck) — SSR safety comes from wrapping `<StepEditor>` in `<ClientOnly>` plus the `v-if="editor"` guard. Empty-state mismatch (`''` vs `'<p></p>'`) causes constant `setContent()` resets — normalize via `isEmpty()` helper.
- **Dietary options**: empty string `value: ''` causes Nuxt UI v4 falsy-value handling to break USelect — use sentinel `'none'` instead.
- **`isDirty` tracking**: compare via `JSON.stringify` of `{ ingredients, stepsForSnapshot }`. Set `initialSnapshot` synchronously after data loads in `loadBranchSnapshot()`, not in a separate `watch`. Exclude local UI state (`translationsOpen`) from the snapshot.
- **Rate limiting across Passenger processes**: in-memory rate limiting is NOT multi-process safe. The `rate_limit_hits` DB table is the correct approach.
- **Ingredient nutrition source**: `ingredient_nutrition.source = 'swiss-blv-v7'` identifies Swiss BLV rows. Manually curated entries use `'curated'`.
- **UDropdownMenu navigation**: use `to:` for navigation items, `click:` for actions. Items need `color: 'neutral'` so they don't default to the primary highlight. Separately, the menu items (incl. their leading **icons**) carry a colour `transition` that **fades the highlight out on open**, reading as a one-frame flash. `transition` does not inherit, so `main.css` disables it on `[role='menu'] [role='menuitem']`, its `::before`, **and every descendant (`*`)** — the icon flash was only fixed once the descendant selector was added (verified frame-by-frame with Playwright).
- **Multi-statement inline handlers break the build**: a `@click="a = 1\n b = 2"` (multiple statements on separate lines, no semicolons) fails the Vue macro parser at build time. Use a single expression or a `function` in `<script setup>`. (Was masked while CI was red on typecheck.)
- **Nuxt UI v4 `USelect` uses `:items` + `value-key`, never `:options`** (a v3 holdover that is silently ignored → empty dropdowns). Fixed in explore filters + GMR-create branch pickers.
- **Drizzle migration meta MUST be tracked**: `server/database/migrations/meta/` (the `_journal.json` + per-migration snapshots) was previously gitignored, which silently broke `drizzle-kit migrate` on any fresh checkout (CI/deploy) — no journal means no migrations applied. It is now versioned; never re-ignore it.
- **Dead-code gate (`knip`)**: `npm run knip` (config in `knip.json`, enforced in CI) flags unused files/exports/deps. The mysql2 pool is closed gracefully on Nitro shutdown via `server/plugins/database.ts`.
- **Nuxt path-prefixes components in subdirectories**: `components/common/HelpHint.vue` registers as `<CommonHelpHint>`, not `<HelpHint>` (same for `<CommonGlossaryTerm>`, `<CommonBrandLogo>`). Using the bare name silently renders nothing — this is why `GlossaryTerm`/`HelpHint` sat unused until adopted onto the fork/merge controls + history page.
- **a11y axe gate**: `tests/e2e/a11y.spec.ts` fails CI on any **critical** axe violation; **serious** ones are logged. Fixed: missing `<html lang>` (set from i18n locale in `app.vue`) and 5 unnamed comboboxes (locale switchers + explore filters now have `aria-label`). **Brand-orange contrast** is now handled **light-mode only**: `main.css` darkens `primary-300…950` and the muted/dimmed neutral text under `:root:not(.dark)` (dark mode keeps the lighter palette, which already contrasts on dark bg). Difficulty + dietary badges and the in-text Sentry privacy link were darkened too (light `text-*-700`, `dark:text-*-400`). Modal focus-traps/keyboard-nav rely on Nuxt UI defaults (not independently audited).
- **Double focus indicator**: the global `:focus-visible { outline }` fallback stacked on top of Nuxt UI's own ring on inputs/buttons. `main.css` now suppresses the global outline on native form controls + Reka widget roles (`:is(input, textarea, select, button, [role=...]):focus-visible { outline: none }`) so they show a single ring; links/custom elements keep the fallback outline.
- **App shell (fixed chrome, scroll-in-content)**: `default` + `dashboard` layouts are `flex flex-col h-dvh overflow-hidden`; the header, footer (and dashboard sidebar) are `shrink-0`, and **only `<main>` scrolls** (`flex-1 overflow-y-auto`). `h-dvh` (not `h-screen`) handles mobile browser chrome. Header is no longer `sticky` (it's a flex row in the shell).
- **Custom scrollbars**: `main.css` styles a slim, rounded, themed thumb (`--gm-scrollbar-thumb`, light/dark) via `scrollbar-width`/`scrollbar-color` (Firefox) + `::-webkit-scrollbar*` (Chromium) — replaces the chunky native OS bar on every scroll container.
- **Mobile nav**: below `md`, both layouts hide the desktop control cluster (`hidden md:flex`) and show `<LayoutMobileMenu>` — a hamburger opening a `USlideover` offcanvas with all nav links (incl. dashboard/starred), the language switcher, theme toggle, tour helper and account actions. Closes on route change via a `route.fullPath` watcher.
- **Dependency updates (2026-06-20)**: safe in-range minors/patches bumped — `@nuxt/ui` 4.6→4.9, all `@tiptap/*` 3.22→3.27, `vitest`+`@vitest/coverage-v8` 4.1.9, `happy-dom`, `mysql2`, `sharp`, `vue` 3.5.38 (gate stayed green). **Security fixes (highs):** `nodemailer` 8→**9.0.1** (the `<=9.0.0` raw-option file-read/SSRF advisory — our `mailer.ts` only uses `createTransport`+`sendMail`, never `raw`, so the bump is low-risk); `vite` pinned to **6.4.3** via `overrides` (clears the NTLM/`fs.deny` highs while staying on the Nuxt-4 vite-6 line — no jump to vite 7). **`@sentry/nuxt` held at 10.57** — 10.59 drags in `nitro@3`/`vite@7`, conflicting with the Nuxt 4 stack. **Majors deliberately held** (each a breaking migration; do as a focused pass): `zod` 4, `eslint` 10, `typescript` 6, `vue-router` 5, `@nuxtjs/i18n` 10, `@vite-pwa/nuxt` 1, `drizzle-kit` 0.31, `diff-match-patch-es` 1. **Accepted (5 remaining, all dev-only, not in the runtime bundle)**: `xlsx` high (no fix; the Swiss-foods import script) and `esbuild` moderates in build tooling (`@nuxt/vite-builder`, `vite-node`, `drizzle-kit` — fix needs `drizzle-kit` 0.31 major).
- **Scroll container reaches the viewport edge**: the dashboard layout's body row is **full-width** (`flex-1 flex` — no `max-w` on the row), so the sidebar sits at the left edge and `<main>`'s scrollbar sits at the right edge. Content is capped + centred **inside** `<main>` (`max-w-screen-2xl mx-auto`). Capping the row instead (a previous bug) left the scrollbar floating ~512px from the edge on wide screens.
- **Onboarding vs. Tour** (one flow, two parts): **onboarding** = the `ConceptIntro` "Welcome" modal (explains fork/branch/commit/merge aliases), shown once on first login; **tour** = `useProductTour` + `TourOverlay`, a guided walkthrough that highlights `data-tour` anchors. The intro's "Got it" now actually launches the tour. Both are **mounted globally in `app.vue`** (not per-layout) so they work in every layout — previously they lived only in `default.vue`, so the tour silently did nothing on dashboard pages. The tour driver carries a `route` per step (`'@recipe'` resolves to a public recipe the viewer can fork, fetched on `start()`); the overlay **navigates** to each step's route, **polls** for the anchor (~2.5s), **clamps** the panel inside the viewport (mobile-safe), and **auto-skips** any step whose anchor never appears so it can't dead-end. Anchors: `explore-search` (/explore), `new-recipe-btn` (/dashboard page button), and `fork-button`/`star-button`/`history-link`/`gourmerge-requests-link` (recipe detail). Verified frame-by-frame on desktop + 390px mobile.
- **Fork carries history**: `POST /api/recipes/[id]/fork` replays the source default branch's **full commit chain** (root→head) into the fork, preserving `parentCommitId` lineage, original `authorId`/`createdAt` and step `contentTranslations` (the old version copied only the head snapshot and dropped translations). Commits inserted one-by-one (child parent refs the freshly-created parent); ingredient/step rows batch-inserted after. `mergeSourceCommitId` remapped only if in the copied set, else null. Bounded by `MAX_FORK_HISTORY` (1000).

---

## 14. Deployment (Target: Netcup + Passenger)

Production is **NOT Docker**. `docker-compose.yml` is local dev MariaDB only.

| Component | Config                                                  |
| --------- | ------------------------------------------------------- |
| Host      | Netcup Webhosting (shared) + separate MySQL server      |
| Server    | Apache + Phusion Passenger running Node.js              |
| Startup   | `app.js` → `.output/server/index.mjs`                   |
| Env vars  | Injected via Passenger env directives (never committed) |
| Restart   | `touch tmp/restart.txt`                                 |
| Preset    | Nitro `node-server`                                     |

Required env vars: `DATABASE_URL`, `NUXT_SESSION_PASSWORD`, `NUXT_PUBLIC_SENTRY_DSN`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `NUXT_PUBLIC_APP_URL`.

Full deployment runbook: `docs/RUNBOOK.md`.

---

## 15. Active Branch

`feature/phase-0-foundation` — all current development is on this branch. `master` is the target for production deploys.

### Finishing plan — executed (2026-06-20)

The "to gold-plated v1" finishing plan ran end to end. Committed phases:

- **CI unblocked** — TipTap typecheck fix, Prettier baseline + `format:check`, stored-XSS closed (Markdown sanitizer).
- **Prod safety** — Pino log rotation, server-side Sentry capture, prod HSTS, secrets/`docs/SECRETS.md`, verify rate-limit, `requireVerifiedUser` wired.
- **i18n** — all 4 locales saveable; transactional emails localized.
- **Schema/data** — FULLTEXT search; Vanilla Sugar seed; **migration `meta/` un-ignored** (migrations previously applied nothing on fresh checkouts).
- **GMR merge** — interactive per-conflict resolution + `FOR UPDATE` guard; repaired build-breaking handlers + 5 broken `:options` dropdowns (GMR creation was unusable).
- **Tests** — 118 unit (97% gate) + 24 Playwright (API/journey/axe); CI coverage gate + `E2E` workflow.
- **Dead code** — knip gate; removed dead composable/types/keys; drizzle-orm CVE upgrade; Dependabot + critical-audit gate.
- **a11y** — `<html lang>`, combobox labels, StepEditor labels i18n'd; axe critical-gate.

**Tracked follow-ups (not blocking, owner decisions):** brand-orange `color-contrast` to meet WCAG AA; CSP `script-src 'unsafe-inline'` hardening; dedicated component-mount tests (E2E covers functionally); nodemailer/vite/esbuild advisories (Dependabot PRs).
