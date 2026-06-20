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
| Database      | MariaDB via Drizzle ORM (mysql2)               | drizzle ^0.44 |
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

## 5. Pages (23)

| Route                                           | Page                                  | Auth        | Layout    |
| ----------------------------------------------- | ------------------------------------- | ----------- | --------- |
| `/`                                             | Landing                               | No          | default   |
| `/dashboard`                                    | My dashboard                          | Yes         | dashboard |
| `/recipes`                                      | My recipes list                       | Yes         | dashboard |
| `/recipes/new`                                  | Create recipe                         | Yes         | dashboard |
| `/explore`                                      | Public discovery (search/filter/sort) | No          | default   |
| `/[username]`                                   | User public profile                   | No          | default   |
| `/[username]/[slug]`                            | Recipe detail                         | No          | default   |
| `/[username]/[slug]/edit`                       | Recipe editor (TipTap + ingredients)  | Yes (owner) | dashboard |
| `/[username]/[slug]/branches`                   | Branch management                     | Yes (owner) | dashboard |
| `/[username]/[slug]/history`                    | Commit history timeline               | No          | dashboard |
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

---

## 6. API Routes (32 endpoints)

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
| POST   | `/api/recipes`                           | Yes         | Create recipe (transactional: recipe+branch+commit) |
| GET    | `/api/recipes/explore`                   | No          | Public browse (search/filter/sort/paginate)         |
| GET    | `/api/recipes/by-slug/[username]/[slug]` | No          | Fetch by URL slug                                   |
| GET    | `/api/recipes/[id]`                      | No          | Fetch by internal ID                                |
| PATCH  | `/api/recipes/[id]`                      | Yes (owner) | Update metadata                                     |
| DELETE | `/api/recipes/[id]`                      | Yes (owner) | Delete + cascade cleanup                            |
| POST   | `/api/recipes/[id]/fork`                 | Yes         | Deep-copy fork                                      |
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

| Measure                   | Status   | Notes                                                                                                                                                                                                                                                                 |
| ------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rate limiting             | ✓ Done   | DB-backed (`rate_limit_hits` table) — multi-process safe for Passenger                                                                                                                                                                                                |
| CSRF                      | ✓ Done   | nuxt-auth-utils / Nitro                                                                                                                                                                                                                                               |
| Session rotation          | ✓ Done   | Post-login session regeneration                                                                                                                                                                                                                                       |
| Secure cookies            | ✓ Done   | `httpOnly`, `sameSite=lax`, 14-day maxAge                                                                                                                                                                                                                             |
| Email verification        | ✓ Done   | CSPRNG token + bcrypt hash + SMTP send                                                                                                                                                                                                                                |
| Password reset            | ✓ Done   | CSPRNG token + bcrypt hash + expiry + no-enumeration response                                                                                                                                                                                                         |
| Zod validation            | ✓ Done   | All endpoint bodies + query params                                                                                                                                                                                                                                    |
| Authorization             | ✓ Done   | Ownership checks on all mutating routes                                                                                                                                                                                                                               |
| CSP                       | ✓ Done   | `routeRules` in `nuxt.config.ts` — allows TipTap, Sentry, Google Fonts                                                                                                                                                                                                |
| Security headers          | ✓ Done   | X-Content-Type-Options, X-Frame-Options, Referrer-Policy                                                                                                                                                                                                              |
| HSTS                      | ✓ Done   | Enabled in production via `routeRules` (baked when `NODE_ENV=production`): 1y max-age + includeSubDomains. Local HTTP dev unaffected. `.htaccess` also forces HTTP→HTTPS                                                                                              |
| Email-verification gating | ✓ Done   | `requireVerifiedUser` wired into GMR creation + recipe publish (create/patch to public); no-op unless `REQUIRE_EMAIL_VERIFICATION=true`                                                                                                                               |
| Markdown sanitization     | ✓ Done   | User step HTML/Markdown sanitized via allowlist (`app/utils/markdown.ts`) before `v-html`                                                                                                                                                                             |
| Error sanitization        | ✓ Done   | Verified: Nitro prod handler returns generic `"Server Error"` (no message/data/stack) for unhandled errors; only intentional `createError` 4xx keep `statusMessage`/`data` (e.g. Zod field errors). `error-handler.ts` logs 5xx + sets `x-request-id` for correlation |
| CSP `unsafe-inline`       | ⚠ Caveat | `script-src` still allows `'unsafe-inline'` (Nuxt hydration) — harden via nonce/hash later                                                                                                                                                                            |
| `npm audit`               | Manual   | No automated Dependabot yet                                                                                                                                                                                                                                           |

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

- **Tests**: unit tests for `diff.ts` / `merge.ts` / `units.ts` + an i18n-gate test **do exist** (68 cases, `tests/unit/`). Still missing — component tests, API/integration tests, real E2E (only a skipped placeholder), `slug.ts`/other-util tests, and `--coverage` enforcement in CI
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
- **UDropdownMenu navigation**: use `to:` for navigation items, `click:` for actions. Missing `color: 'neutral'` causes icon colour flash on hover.
- **Multi-statement inline handlers break the build**: a `@click="a = 1\n b = 2"` (multiple statements on separate lines, no semicolons) fails the Vue macro parser at build time. Use a single expression or a `function` in `<script setup>`. (Was masked while CI was red on typecheck.)
- **Nuxt UI v4 `USelect` uses `:items` + `value-key`, never `:options`** (a v3 holdover that is silently ignored → empty dropdowns). Fixed in explore filters + GMR-create branch pickers.
- **Drizzle migration meta MUST be tracked**: `server/database/migrations/meta/` (the `_journal.json` + per-migration snapshots) was previously gitignored, which silently broke `drizzle-kit migrate` on any fresh checkout (CI/deploy) — no journal means no migrations applied. It is now versioned; never re-ignore it.

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

Recent significant commits (newest first):

```
694d0f2  fix(api): handle NO ACTION FK constraints in recipe delete
1ae461d  feat(edit): add delete recipe button with confirmation modal
ff95486  fix(edit): replace window.confirm with UModal for unsaved-changes guard
bf37c37  chore(ingredients): retire generic seed list, add safe cleanup script
84eefcd  fix(layout): align dashboard header/footer width to max-w-7xl
56a6994  feat(nav): add Edit Profile link to user dropdown
f393d5c  fix(ui): resolve nav links, select dropdowns, step editing, layout gaps
f1b843c  feat: multilingual steps/title/description, fix footer slogan, nutrition popover
fc88826  fix(editor): steps editable, metadata fields, Markdown rendering, tags/dietary
ec93f4c  feat(nutrition): compact bar layout on recipe detail page
```
