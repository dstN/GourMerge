# GourMerge — Ground Truth (August 2026)

> Single document of current project state. Updated as features ship.
> For future plans see `ROADMAP.md`. For architectural rules see `ARCHITECTURE.md`.
> **For how the UI looks and the rules that keep it consistent see `DESIGNBOOK.md`.**
> For ops see `docs/RUNBOOK.md`.

---

## 1. What GourMerge Is

A git-like recipe platform. Recipes are repositories with branches, snapshot commits, diffs, forks, and **GourMerge Requests** (the project's mandatory term — "Pull Request" / PR / `pull_request` are forbidden everywhere).

- Slogan: "Fork the recipe, merge the flavor." / DE: "Wo bester Geschmack verschmilzt."
- Target: German-speaking home cooks who want to collaborate on recipes.
- Languages: DE (default), EN, FR, IT — all 4 at full parity.

---

## 2. Tech Stack (fixed — do not substitute)

Versions are the ones actually installed as of 2026-08-05, not the range in
`package.json` — the ranges drifted far behind reality once and cost a debugging
round.

| Layer         | Technology                                     | Installed  |
| ------------- | ---------------------------------------------- | ---------- |
| Framework     | Nuxt                                           | 4.5.1      |
| Bundler       | Vite                                           | 8.2.0      |
| Runtime       | Node (dev, CI and the Plesk host)              | 26         |
| Language      | TypeScript                                     | 6.0.3      |
| UI            | Nuxt UI v4 (Reka UI + Tailwind CSS v4)         | 4.10.0     |
| Database      | MySQL via Drizzle ORM (mysql2)                 | 8.4 / 0.45 |
| Validation    | Zod                                            | 4.4.3      |
| Auth          | nuxt-auth-utils (session-based)                | 0.5.x      |
| i18n          | @nuxtjs/i18n                                   | 10.6.0     |
| Editor        | TipTap 3 + @tiptap/markdown                    | 3.29.2     |
| Diff          | diff-match-patch-es                            | 2.0.0      |
| PWA           | @vite-pwa/nuxt                                 | 1.1.1      |
| Observability | Pino + @sentry/nuxt                            | 10 / 10.69 |
| Deployment    | Netcup Webhosting + Phusion Passenger (Apache) | —          |

**TypeScript 7 is blocked**, not deferred: `@nuxt/ui@4.10.0` declares peer
`typescript "^5.6.3 || ^6.0.0"`, so npm refuses 7. Re-check when Nuxt UI widens it.

---

## 3. Repository Layout

```
GourMerge/
├── app/                        # All frontend source (Nuxt 4 convention)
│   ├── assets/css/main.css     # Tailwind v4 @theme + design tokens (see DESIGNBOOK.md)
│   ├── components/             # Auto-imported Vue components
│   │   ├── common/             # BrandLogo, GlossaryTerm, HelpHint, ObfuscatedEmail,
│   │   │                       # PageShell, PageHeader, EmptyState  (design system)
│   │   ├── layout/             # DashboardSidebar, UserDropdown, MobileMenu, FooterLinks
│   │   ├── onboarding/         # ConceptIntro, HelpMenu, TourOverlay, TourStep
│   │   └── recipe/             # IngredientAutocomplete, IngredientRow, StepEditor,
│   │                           # RecipeCard, RecipeDiffViewer, DietaryBadge, NutritionFacts,
│   │                           # TagList, DifficultyBadge
│   ├── layouts/                # default.vue, dashboard.vue, auth.vue
│   ├── middleware/             # validate-recipe-route.ts, auth.ts, guest.ts
│   ├── pages/                  # 27 pages (see §5)
│   ├── utils/                  # markdown.ts (sanitizer), ui.ts (shared UI maps)
│   ├── app.vue                 # <UApp><NuxtLayout><NuxtPage />
│   └── app.config.ts           # Nuxt UI theme + central component defaults
├── server/
│   ├── api/                    # 41 REST endpoints (see §6)
│   ├── database/
│   │   ├── schema.ts           # Drizzle ORM schema (20 tables)
│   │   └── migrations/         # 9 versioned SQL migrations (0000–0008)
│   ├── middleware/             # Nitro middleware
│   ├── plugins/                # Nitro plugins (db, logger, sentry)
│   └── utils/                  # drizzle.ts, diff.ts, merge.ts, units.ts, slug.ts
├── shared/types/               # TypeScript types shared app ↔ server
├── i18n/locales/               # de.json, en.json, fr.json, it.json (516 keys, 4-way parity)
├── scripts/                    # Maintenance + setup scripts (see §8)
├── public/                     # PWA icons, favicon, apple-touch-icon
├── docs/RUNBOOK.md             # Production operations playbook
├── DESIGNBOOK.md               # Design system — the source of truth for the UI
├── .claude/                    # AI + team reference docs
├── nuxt.config.ts              # Main config (CSP, i18n, PWA, runtime config)
├── drizzle.config.ts           # Drizzle Kit config
├── docker-compose.yml          # LOCAL DEV ONLY — MySQL 8.4
└── app.js                      # Passenger startup shim → .output/server/index.mjs
```

---

## 4. Database Schema (20 tables)

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
| `data_requests`             | GDPR self-service tokens (export/erasure)   | CASCADE on user delete               |
| `user_totp`                 | Opt-in TOTP enrolment (secret encrypted)    | CASCADE on user delete               |
| `user_recovery_codes`       | Single-use 2FA recovery codes (hashed)      | CASCADE on user delete               |
| `user_passkeys`             | WebAuthn credentials (`credential_id` uniq) | CASCADE on user delete               |
| `webauthn_challenges`       | Single-use ceremony challenges, 5-min TTL   | —                                    |

### FK cascade gaps (manually handled in API)

Two FKs use NO ACTION (= RESTRICT in MySQL) and require pre-delete cleanup:

- `recipes.forked_from_recipe_id` — forks nullified before parent delete
- `gourmerge_requests.source_branch_id / target_branch_id / source_recipe_id` — cross-recipe GMRs deleted before branch cascade

This is handled in `server/api/recipes/[id].delete.ts`, and repeated in `server/api/privacy/delete.post.ts` for the "delete my recipes too" path.

### Four RESTRICT FKs, and how a hard delete works anyway

`recipes.owner_id`, `recipe_commits.author_id`, `gourmerge_requests.author_id` and `gm_request_comments.author_id` are all **NOT NULL** and NO ACTION. On top of that `fork.post.ts` copies commits keeping the **original** `author_id`, so a stranger's fork legitimately contains commits authored by the departing user. A bare `DELETE FROM users` therefore either fails on the constraint or destroys rows inside another user's recipe history.

**Account deletion is nonetheless a real `DELETE`** (changed 2026-08-05; it used to anonymise the row in place). A single shared tombstone account — `users.is_ghost`, username `ghost`, seeded by migration `0008` — inherits the orphaned attribution first, which is GitHub's pattern. The user's own content is deleted outright; only their fingerprints inside other people's forks and threads survive, and those read as the anonymous ghost. Git can orphan attribution for free because it stores the author as free text; our `author_id` is a real foreign key, hence the tombstone.

One implementation, `server/utils/hardDeleteUser.ts`, serves both callers — the self-service GDPR erasure and the nightly inactivity job. Two copies would drift on exactly the constraints that make this hard. The ghost is never loginable (`password_hash` is a sentinel no bcrypt comparison can match) and is excluded from every sweep.

### Key schema decisions

- **Snapshot commits**: each commit stores a full ingredient + step snapshot. No delta encoding. Diffs computed on-read.
- **Branch = pointer**: a branch row points to `head_commit_id`. Creating a branch is 1 INSERT.
- **INT PK internal, UUIDv7 external**: `recipes` and `gourmerge_requests` have a `public_id BINARY(16)` (UUIDv7) for external URLs/API — internal JOINs use INT PKs. Auth tokens use CSPRNG, NOT UUIDv7.
- **Metric-canonical units**: DB stores `g` / `ml` / `piece` / `pinch` / `tsp` / `tbsp` only. Display conversion in `server/utils/units.ts`.
- **Commit DAG walked application-side** (`parentCommitId`), not via recursive CTE. The original rationale ("MariaDB CTEs are slow") no longer applies — production is MySQL 8.4 — but the app-side walk stays: it is built, paginated and proven.
- **Explore search**: FULLTEXT index on `recipes(title, description)` (migration `0006`, hand-authored — Drizzle's mysql `index()` can't express FULLTEXT). `explore.get.ts` uses `MATCH … AGAINST` for queries ≥ 3 chars, `LIKE` fallback for shorter terms.

---

## 5. Pages (27)

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
| `/legal/data-request`                           | GDPR self-service request form        | No\*        | default   |
| `/legal/data-request/confirm`                   | Token landing: download or erase      | No\*        | default   |

\* `/explore` uses a **dynamic layout** (`definePageMeta({ layout: false })` + `<NuxtLayout :name="loggedIn ? 'dashboard' : 'default'">`): logged-in users get the dashboard shell with sidebar; guests get the public layout.

---

## 6. API Routes (41 endpoints)

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

### Privacy / GDPR self-service

Deliberately **session-less**: ownership is proven by the emailed confirmation
link, because a user locked out of their account still holds both rights.

| Method | Route                  | Auth | Purpose                                                        |
| ------ | ---------------------- | ---- | -------------------------------------------------------------- |
| POST   | `/api/privacy/request` | No   | Start export/erasure. Always `{ sent: true }` (no enumeration) |
| POST   | `/api/privacy/confirm` | No   | Consume the emailed token; extends the export window to 24h    |
| GET    | `/api/privacy/export`  | No   | Stream the JSON export (token in query, `no-store`)            |
| POST   | `/api/privacy/delete`  | No   | Execute erasure with the chosen recipe scope                   |

---

## 7. i18n Status

- **4 locales**: `de` (default), `en`, `fr`, `it`
- **Strategy**: `prefix_except_default` — German has no prefix; `/en/`, `/fr/`, `/it/` prefixed
- **Key count**: 516 keys, 4-way parity (verified by `npm run i18n:check`)
- **Locale files**: `i18n/locales/{de,en,fr,it}.json`
- **CI gate**: `scripts/i18n-check.mjs` — fails if any locale has a missing key or empty value
- **Translated**: all UI labels, navigation, errors, toasts, onboarding, glossary, legal pages, auth flows
- **Not translated**: user-generated recipe content (stays in author's language)

---

## 8. Scripts

| Script                         | NPM command                                 | Purpose                                                                                                                               |
| ------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `i18n-check.mjs`               | `npm run i18n:check`                        | 4-way locale parity gate                                                                                                              |
| `import-swiss-foods.mjs`       | `npm run seed:swiss`                        | Import Swiss BLV Food Composition DB V7.0                                                                                             |
| `seed-ingredients.mjs`         | `npm run db:seed`                           | Curated ingredient entries (not in Swiss BLV)                                                                                         |
| `cleanup-seed-ingredients.mjs` | `node scripts/cleanup-seed-ingredients.mjs` | Remove non-BLV ingredients not used in any recipe                                                                                     |
| `seed-tags.mjs`                | —                                           | Seed default recipe tags                                                                                                              |
| `reconcile-counters.mjs`       | —                                           | Repair denormalized star/fork counters (idempotent)                                                                                   |
| `generate-icons.mjs`           | `npm run generate:icons`                    | Generate PWA/favicon assets from brand SVG                                                                                            |
| `cleanup-retention.mjs`        | `npm run db:cleanup`                        | **Enforce the retention windows the privacy policy states.** Nightly cron in production — see `docs/RUNBOOK.md`. `--dry-run` previews |

`npm run db:setup` chains migrate + all three seeds for a fresh clone.
`npm run seed:swiss:regen` rebuilds the committed seed from the BLV spreadsheets.

---

## 9. Ingredient Data

The `ingredients` master table is populated from the **Swiss BLV Food Composition Database V7.0** (naehrwertdaten.ch).

- **1191** Swiss food entries with DE/EN/FR/IT names and synonyms. (Previously documented as "~2300+" — wrong; the BLV generic-foods sheet is `A1:EK1193`, i.e. 1191 data rows after two header rows, and the importer merges all four language exports onto that same ID set.)
- Nutrition data per 100g (kcal, macros, fiber, micros) in `ingredient_nutrition`
- Source marker: `ingredient_nutrition.source = 'swiss-blv-v7'`
- Locale-aware search: name + synonyms matched by user's locale (`GET /api/ingredients?q=&locale=`)
- Curated entries (not in Swiss DB) can be added to `seed-ingredients.mjs` with `source = 'curated'`
- **Vanilla Sugar** (`Vanillezucker`): not in Swiss BLV DB — added as a curated entry in `seed-ingredients.mjs` (apply with `npm run db:seed`)

### Seeding (committed seed file, not the spreadsheets)

`server/database/seeds/swiss-foods.jsonl` (1191 foods, ~1 MB, **tracked**) is the seed source, so a fresh clone can run `npm run db:setup` — migrate + all three seeds — with no downloads and without the `xlsx` dependency. JSON Lines, one food per line, so a dataset update is a reviewable diff rather than one rewritten mega-line.

`scripts/import-swiss-foods.mjs` reads that file by default; `--from-xlsx` re-parses the four BLV spreadsheets from `.claude/data/swiss/` (gitignored, not redistributed) and `--emit-seed` regenerates the seed. `xlsx` is a **lazy** import inside that path only, so the contributor path never loads the package carrying the unfixed advisory.

**No SQL dump is committed, deliberately**: it would be a second source of truth for the schema competing with the migrations, is unreviewable in a diff, and bakes in engine/version specifics. Schema ← migrations; reference data ← seed file.

---

## 10. Security Implementation

| Measure                   | Status | Notes                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rate limiting             | ✓ Done | DB-backed (`rate_limit_hits` table) — multi-process safe for Passenger                                                                                                                                                                                                                                                         |
| CSRF                      | ✓ Done | nuxt-auth-utils / Nitro                                                                                                                                                                                                                                                                                                        |
| Session rotation          | ✓ Done | Post-login session regeneration                                                                                                                                                                                                                                                                                                |
| Secure cookies            | ✓ Done | `httpOnly`, `sameSite=lax`, 14-day maxAge                                                                                                                                                                                                                                                                                      |
| Email verification        | ✓ Done | CSPRNG token + bcrypt hash + SMTP send                                                                                                                                                                                                                                                                                         |
| Password reset            | ✓ Done | CSPRNG token + bcrypt hash + expiry + no-enumeration response                                                                                                                                                                                                                                                                  |
| Zod validation            | ✓ Done | All endpoint bodies + query params                                                                                                                                                                                                                                                                                             |
| Authorization             | ✓ Done | Ownership checks on all mutating routes                                                                                                                                                                                                                                                                                        |
| CSP                       | ✓ Done | Set per-request in `server/plugins/csp.ts` (`render:html` hook), not `routeRules` — allows TipTap inline styles, Sentry, Google Fonts                                                                                                                                                                                          |
| Security headers          | ✓ Done | X-Content-Type-Options, X-Frame-Options, Referrer-Policy                                                                                                                                                                                                                                                                       |
| HSTS                      | ✓ Done | Enabled in production via `routeRules` (baked when `NODE_ENV=production`): 1y max-age + includeSubDomains. Local HTTP dev unaffected. The host 301s HTTP→HTTPS on both names, and `server/middleware/canonical-host.ts` folds `www` into the apex                                                                              |
| Email-verification gating | ✓ Done | `requireVerifiedUser` wired into GMR creation + recipe publish (create/patch to public); no-op unless `REQUIRE_EMAIL_VERIFICATION=true`                                                                                                                                                                                        |
| Markdown sanitization     | ✓ Done | User step HTML/Markdown sanitized via allowlist (`app/utils/markdown.ts`) before `v-html`                                                                                                                                                                                                                                      |
| Error sanitization        | ✓ Done | Verified: Nitro prod handler returns generic `"Server Error"` (no message/data/stack) for unhandled errors; only intentional `createError` 4xx keep `statusMessage`/`data` (e.g. Zod field errors). `error-handler.ts` logs 5xx + sets `x-request-id` for correlation                                                          |
| CSP `script-src` nonce    | ✓ Done | Production drops `'unsafe-inline'` from `script-src`; every inline `<script>` gets a per-request nonce (`script-src 'self' 'nonce-…'`). Dev keeps `'unsafe-inline'` (Vite/HMR). Verified against a prod build: 0 CSP violations, app hydrates, color-mode FOUC guard runs                                                      |
| `npm audit`               | ✓ Done | CI fails on **critical** advisories; Dependabot (`.github/dependabot.yml`) proposes high/moderate fixes as CI-validated PRs. drizzle-orm upgraded to ≥0.45.2 (SQL-identifier injection fix). Known accepted highs: `xlsx` (dev-only import script), `nodemailer` raw-option (unused), `vite`/`esbuild` dev-server (transitive) |

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
- **i18n**: 4 locales (DE/EN/FR/IT), 516 keys in parity, 4-way CI gate — incl. transactional emails (verification + password reset) localized per recipient's `preferredLocale`
- **Onboarding**: concept explainer, interactive skippable/re-runnable tour, guided first-recipe flow, contextual help (`<HelpHint>`), glossary page
- **GDPR self-service**: data export (Art. 15/20) and account erasure (Art. 17) at `/legal/data-request`, both confirmed by email rather than by a session. Exports are built per request and streamed — never written to disk — and exclude the password hash. Erasure **hard-deletes the account row** and lets the user choose whether recipes go too; the four RESTRICT FKs are handled by reassigning attribution that lives inside other people's recipes to a shared `ghost` account first (see §4). Retention windows are stated in the policy **and enforced** by `npm run db:cleanup`
- **Legal texts**: imprint + privacy policy fully translated in all four locales (they were hardcoded German with only the title translated). Contact email rendered via `<CommonObfuscatedEmail>` — readable without JS, `aria-hidden` decoy against scrapers, `mailto:` attached only on mount, so the address never appears in the SSR payload
- **Dirty-state guard**: edit page navigation guard via UModal (not `window.confirm` — suppressed in Chromium)
- **Delete recipe**: from edit page with confirmation modal; cascade handles all FK cleanup
- **Layout**: default (header nav + footer), dashboard (sidebar + max-w-7xl header/footer), auth (minimal)
- **PWA**: icons generated, manifest configured, autoUpdate service worker
- **Observability**: Pino logging with file rotation + client/server Sentry capture + `/api/health` (see §11)
- **Security headers**: static headers in `nuxt.config.ts` `routeRules`; CSP set per-request in `server/plugins/csp.ts` (nonce-based `script-src` in production)
- **Markdown sanitization**: user step content sanitized via allowlist before `v-html` (`app/utils/markdown.ts`)
- **Brand**: GourMerge SVG logo (`BrandLogo.vue`), saffron primary ramp, DM Sans + JetBrains Mono fonts
- **Two-factor authentication (opt-in)**: TOTP per RFC 6238, working with any authenticator app — the enrolment URI uses the standard SHA1 / 6-digit / 30 s parameters because Google Authenticator _ignores_ non-default values and would otherwise import a secret whose codes never validate. Secret encrypted at rest (AES-256-GCM), ten bcrypt-hashed single-use recovery codes shown once, replay protection on the accepted time step, 8-per-5-min rate limit on every verify path. The post-password state is a short-lived HMAC-signed cookie, **not** a session — a half-authenticated session would make `requireUserSession()` succeed and render the second factor decorative. Disabling requires the password, not a code, so a broken phone cannot lock you out of the setting
- **Passkeys (opt-in, WebAuthn/FIDO2)**: usernameless sign-in with no email, password or TOTP code — add one in `/settings`, then use the login page's passkey button. A successful assertion completes the login outright, and that is stronger rather than weaker: the private key never leaves the authenticator and the origin is bound into the assertion, so it is phishing-resistant in a way TOTP is not. TOTP stays the second factor for **password** logins. Enrolment requires a session (the trust anchor) and the client-supplied `userName` is discarded in favour of it. Challenges are DB-backed, single-use, 5-min TTL — not session-backed, because a passwordless login has no session yet and Passenger's multiple processes would split the two halves of a ceremony. Counter regression is refused as the clone signal, except that `0` is tolerated because synced passkeys always report it. Two things must be stated explicitly and are easy to lose: `residentKey: 'required'` (nuxt-auth-utils replaces SimpleWebAuthn's `authenticatorSelection` wholesale, which silently makes the credential non-discoverable and the whole feature unusable) and `userVerification: 'required'` **plus an own `userVerified` assertion** (the library verifies with a hardcoded `requireUserVerification: false`, so a presence-only assertion would otherwise bypass password _and_ 2FA). Both are covered by `tests/e2e/passkey.spec.ts`, which drives a real virtual authenticator
- **Inactive-account deletion**: three years without a login → hard delete, preceded by warning emails at 6 months, 4 weeks and 24 hours (`npm run db:inactive`, nightly). The clock is `users.last_login_at` and **only a login resets it** — a notice does not, or it would extend the period it warns about. Nothing is deleted unless the final notice went out ≥24 h earlier, which is what stops the first post-deploy run from deleting every dormant account unwarned
- **One canonical host, enforced in the app**: `server/middleware/canonical-host.ts` folds `www.` into the apex (301 for GET/HEAD, 308 otherwise so a POST keeps its body), skipping `/.well-known/`. It lives in the app rather than in Apache config because there is **no `.htaccess` on this host** — Netcup's Node.js panel configures Passenger and every environment variable directly — and because an nginx proxy sits in front of Apache, so a rewrite rule there is not guaranteed to run. Only a leading `www.` is stripped: redirecting any host that disagrees with `NUXT_PUBLIC_APP_URL` could loop if that variable were itself wrong, whereas this cannot, and `/api/health` surfaces every other mismatch as a 503. It matters beyond tidiness — the WebAuthn RP ID **is** the hostname, so a passkey enrolled on `www` does not exist on the apex
- **Maintenance tasks run over HTTP, not cron**: `GET /tasks/retention` and `GET /tasks/inactive-accounts`, guarded by `CRON_SECRET` (constant-time compare; unset means refuse everything). A shell cron cannot work on this host — the deploy ships only `.output/` + `app.js`, so there is no `scripts/`, no `package.json` and no `.env`, and a Plesk scheduled task does not inherit the **Node.js custom environment variables** Passenger injects into the app process. Plesk's **"Fetch a URL"** task type runs the job inside the app instead. Sweep logic in `server/utils/{retention,inactivity}Sweep.ts`; the CLI scripts stay for local use and share `maintenanceConfig.json` so the paths cannot drift
- **The inactivity sweep refuses to run without SMTP**: `sendMail()` falls back to a `streamTransport` that succeeds while delivering nothing (deliberate, so local dev is not blocked), which for this job would stamp the notice column and hard-delete the account 24h later unwarned. Both the endpoint and the CLI now stop; dry runs still work

### ✓ Complete (test + delivery pipeline)

- **Tests**: **unit** — 251 cases (`tests/unit/`: diff, merge incl. resolution, units incl. the display read path, slug, uuid, nutrition, markdown-XSS, emailI18n, i18n-gate, totp, webauthn, seal/pendingTotp, dataRequest, inactivityEmails, ui), **93% line coverage** against a 75/75/70 gate in CI. **E2E/API/a11y** — 39 Playwright specs across 12 files (`tests/e2e/`): auth lifecycle + authz matrix, recipe CRUD/fork/star, merge conflict-detect → interactive resolve → verify → immutable, SSR render, register UI journey, passkey ceremonies over CDP, and axe scans (critical-gated). Run via `npm run test:e2e` + the `E2E` workflow on master
  - `passkey.spec.ts` drives Chrome's **WebAuthn virtual authenticator** over CDP, because nothing weaker proves anything: the browser will not sign without an authenticator and a stubbed `navigator.credentials` would only test the stub — it is what caught both passkey bugs. Two constraints to know before touching it: navigating while an authenticator is attached crashes the renderer, so every ceremony runs on **one page load** via in-page fetches; and it needs `CI=1` (built artifact) like the rest of the suite
- **CI** (`ci.yml`): lint → **design:check** → format:check → knip → typecheck → i18n → `npm audit` (critical) → migrate → test **with coverage gate** → build → upload artifact. Build stamps `NUXT_SENTRY_RELEASE` = commit SHA
- **CD** (`deploy.yml`): preflight secrets → E2E gate → `production` environment gate → checkout of the CI-built SHA → migrate from the runner (fail-fast) → **tar-over-ssh** into `.output.new` → atomic rename swap (previous kept as `.output.prev`) → restart → polling smoke test → **auto-rollback on smoke-test failure**. Password auth via `sshpass` over plain `ssh` (Netcup offers no key auth; `rsync` and `gzip` do not exist in the chroot)
- **Dependabot + audit gate**: `.github/dependabot.yml` proposes high/moderate fixes; CI fails on critical

### ✗ Not yet done / deliberately deferred

- **Dedicated component-mount tests**: not added — covered functionally by the E2E journeys
- ~~E2E does not gate deploy~~ — **now gated.** `deploy.yml`'s first step polls the GitHub API for the `e2e.yml` run matching `workflow_run.head_sha` and refuses to deploy unless it concluded `success` (30 min deadline, newest run wins so a re-run supersedes). It runs before the migrate step, so a failed E2E never touches the production DB. Caveat: re-running `CI` alone without a corresponding E2E run for that SHA will time out — dispatch `E2E` for the commit first
- **Staging environment**: ROADMAP §8 describes local → staging → production; only local and production exist
- **Manual/infra steps** (owner actions, not code) — all documented in `docs/RUNBOOK.md`. Done as of 2026-08-06: wildcard SSL + HSTS, all 12 runtime variables injected as Netcup **Node.js custom environment variables** (there is no `.htaccess` on this host — Passenger is configured by the panel), production migrated and seeded, `scripts/server-backup.sh` installed, and a **restore drill passed** (counts + `CHECKSUM TABLE` identical, `JSON_VALID` 1192/1192/1192, utf8mb4 intact — which matters because the host's `mysqldump` is MariaDB's against a MySQL 8.4 server). Still open: schedule the 03:15 Plesk backup task, and point UptimeRobot at `/api/health`
- ~~Majors held~~ — **all taken (2026-08-05):** `zod` 4.4.3, `eslint` 10.8.0, `typescript` 6.0.3, `vue-router` 5.2.0, `@nuxtjs/i18n` 10.6.0, `@vite-pwa/nuxt` 1.1.1, `drizzle-kit` 0.31.10, `diff-match-patch-es` 2.0.0, plus `nuxt` 4.5.1 / `vite` 8.2.0. **Still blocked: `typescript` 7** — `@nuxt/ui@4.10.0` declares peer `typescript "^5.6.3 || ^6.0.0"`, so npm refuses 7. Re-check when Nuxt UI widens that range.

- ~~**UI consistency audit**~~ — **done (2026-08-05).** See §16.

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
- **Inline handlers must not leak a return value on Nuxt UI components**: `@click="open = true"` or `@click="editor.chain()…run()"` compiles to `($event) => (expr)`, whose return type is the assigned value / `boolean`. TypeScript's void-return bivariance (a `() => T` _is_ assignable to `() => void`) **does not apply** because Nuxt UI 4.9 types the click prop as the **union** `((e: MouseEvent) => void | Promise<void>) | […][] | undefined` — the special rule only fires when the target return type is exactly `void`. Result: `error TS2322` on **components** but not on native `<button>`, which is why only some sites broke. Fix: wrap in a block arrow so it returns `undefined` — `@click="() => { open = true }"`. Inside a closure the `v-if="editor"` narrowing is lost, so use `editor?.chain()`. This surfaced from the Nuxt UI 4.6→4.9 bump and broke 11 call sites.
- **Nuxt UI v4 `USelect` uses `:items` + `value-key`, never `:options`** (a v3 holdover that is silently ignored → empty dropdowns). Fixed in explore filters + GMR-create branch pickers.
- **Every environment is MySQL 8.4 — never MariaDB**: the docs specified MariaDB for months while production (**8.4.11**) and local dev were both MySQL; only `ci.yml`/`e2e.yml` ran `mariadb:11`, making the **test suite the single MariaDB in the project**. That is not academic: the ingredient autocomplete and ingredient-name resolution run raw `JSON_UNQUOTE(JSON_EXTRACT(…))` with a collation-sensitive `LIKE`, and explore search uses `MATCH … AGAINST`. MariaDB implements `JSON` as `LONGTEXT` + a CHECK constraint, so comparison, collation and full-text tokenizer/stopword behaviour all differ from MySQL's native JSON type — German umlaut and accent matching was being tested on one engine and served from another. CI, E2E and `docker-compose.yml` are now pinned to `mysql:8.4`. The MySQL image needs `MYSQL_*` env vars (not `MARIADB_*`) and `mysqladmin ping -h 127.0.0.1` as its healthcheck — `-h 127.0.0.1` forces TCP so the check cannot pass against the init-phase unix socket before the network listener is up.
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
- **Onboarding vs. Tour** (one flow, two parts): **onboarding** = the `ConceptIntro` "Welcome" modal (explains fork/branch/commit/merge aliases), shown once on first login; **tour** = `useProductTour` + `TourOverlay`, a guided walkthrough that highlights `data-tour` anchors. The intro's "Got it" now actually launches the tour. Both are **mounted globally in `app.vue`** (not per-layout) so they work in every layout — previously they lived only in `default.vue`, so the tour silently did nothing on dashboard pages. The tour driver carries a `route` per step: a literal path, `'@recipe'` (another user's public recipe, fetched on `start()` via `resolveOtherRecipe()` — only Fork needs this, since forking your own brand-new recipe makes no sense), or `'@demo'` (the recipe the visitor creates through the **real** `/recipes/new` form during the `new-recipe-btn` step). The demo recipe is not fabricated by a background API call — the tour navigates the "+ Neues Rezept" button to `/recipes/new?tour=1` (defaults the form to **private**, dodging the email-verification gate on public recipes — see `recipes/new.vue`), suspends its own backdrop/panel (`TourOverlay`'s `suspended`) so the real form underneath is actually clickable, and a `route.path` watcher detects arrival at `/<owner>/<slug>/edit` (the form's success redirect) to capture the recipe and resume. `finish()`/`skip()` both delete it again (`cleanupDemoRecipe`, best-effort) — abandoning the tour outright (closed tab) is the one path that leaves it behind. Step order: `explore-search` (/explore) → `new-recipe-btn` (/dashboard button) → `star-button`/`history-link`/`gourmerge-requests-link` (`@demo`) → `fork-button` (`@recipe`, last, since it's the one step still needing a stranger's recipe). The overlay **navigates** to each step's route, **polls** for the anchor (~2.5s), **clamps** the panel inside the viewport (mobile-safe), and **auto-skips** any step whose anchor never appears (or whose `@recipe`/`@demo` target never resolved) so it can't dead-end. Verified frame-by-frame on desktop + 390px mobile.
- **Fork carries history**: `POST /api/recipes/[id]/fork` replays the source default branch's **full commit chain** (root→head) into the fork, preserving `parentCommitId` lineage, original `authorId`/`createdAt` and step `contentTranslations` (the old version copied only the head snapshot and dropped translations). Commits inserted one-by-one (child parent refs the freshly-created parent); ingredient/step rows batch-inserted after. `mergeSourceCommitId` remapped only if in the copied set, else null. Bounded by `MAX_FORK_HISTORY` (1000).

- **Nuxt UI form controls are NOT full width by default**: `UInput`/`UTextarea`/`UInputMenu`/`UInputNumber` have an `inline-flex` **`root`** slot, and `USelect`/`USelectMenu` an `inline-flex` **`base`** slot, so a control shrinks to content width unless something adds `w-full`. `app/app.config.ts` appends it to those slots once, centrally — never write `class="w-full"` on a form control. (Before that, `w-full` was on 9 controls and missing from 23, so login's email field was ~20 characters wide while the settings fields were full width.)
- **`app.config.ts` is the supported central lever**: components resolve props through `useComponentProps`, which reads `appConfig.ui.<component>.defaultVariants.<prop>` — it beats the component's own default and loses to an explicitly-passed prop. Slot classes (`ui.<component>.slots.<slot>`) merge into the theme via `tv({ extend: theme, ...appConfig.ui.<component> })` with tailwind-merge, so adding a class appends it everywhere.
- **`route.meta.auth` is not a thing** — there is no global middleware reading it. `definePageMeta({ auth: true })` compiles fine, type-checks fine, and does **nothing**. Guarding a page requires `middleware: 'auth'`. Two pages shipped unguarded this way (see §16).
- **Only `<main>` scrolls, so `<main>` needs `tabindex="0"`** — with `tabindex="-1"` the sole scroll container is unreachable by keyboard, which axe reports as `scrollable-region-focusable`. It only shows up on a page whose content contains nothing focusable (`/help/glossary`), which is why it hid for so long. The skip-link works with either value.
- **An in-text link must not rely on colour alone** (WCAG 1.4.1): `.link` is always underlined, with a dialled-back `text-decoration-color` that goes solid on hover. Underline-on-hover-only fails axe's `link-in-text-block`.
- **Dark mode needed its own contrast fix**: Nuxt UI's dark `text-dimmed` (neutral-500) measures **3.74:1** on our dark card surface. `main.css` lifts dark `--ui-text-muted`/`--ui-text-dimmed` one step each. The light-mode darkening block is _not_ sufficient on its own — both modes need pinning.
- **axe "serious" is not a free pass**: the gate fails on critical only, so three real defects sat in the console log for months. Treat a logged serious as a defect (see §16).

---

## 14. Deployment (Target: Netcup + Passenger)

Production is **NOT Docker**. `docker-compose.yml` is local dev MySQL only.

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
- **Tests** — 118 unit (97% gate) + 24 Playwright (API/journey/axe); CI coverage gate + `E2E` workflow. (Now 150 unit at 94.7% lines — see §16.)
- **Dead code** — knip gate; removed dead composable/types/keys; drizzle-orm CVE upgrade; Dependabot + critical-audit gate.
- **a11y** — `<html lang>`, combobox labels, StepEditor labels i18n'd; axe critical-gate.

Post-plan commits: brand-orange contrast (light-mode palette darkening), fixed app shell + mobile offcanvas nav + custom scrollbars, forks list + starred dashboard + fork-carries-history, guided tour end-to-end repair, dependency/security bumps, scrollbar-at-viewport-edge, **nonce-based CSP `script-src`** (dropped `'unsafe-inline'` in prod).

### Release readiness (2026-08-04)

Audited the branch against §10 of `ROADMAP.md` before cutting v1. Fixed in this pass:

- **Typecheck was red** — 11 inline `@click` handlers leaked a return value after the Nuxt UI 4.6→4.9 bump (see §13). CI would have failed on every push; the previous close-out predates the bump.
- **Production migrations could never run** — `deploy.yml` ran `npx drizzle-kit migrate` over SSH, but only `.output/` + `app.js` are rsynced: the host has neither `drizzle.config.ts`, `server/database/migrations/`, nor the CLI. Migrations now run **from the CI runner** (matching ROADMAP §8's "against MySQL (CI secrets)"), fail-fast, and **before** the release is swapped in. Requires the production MySQL to accept connections from GitHub Actions — SSH fallback documented in the runbook.
- **Rollback was impossible** — `rsync --delete` went straight into the live `.output/`, so no previous artifact survived, and the runbook documented a `releases/<ts>` + `current` symlink layout that was never implemented. Deploy now stages to `.output.new`, swaps by rename (retaining `.output.prev`), and **auto-rolls back if the smoke test fails**. A symlink layout was rejected: it would require repointing the Netcup docroot, which the panel's application root + `app.js` assume.
- **Sentry had no release tag** — `NUXT_SENTRY_RELEASE` is read at _build_ time but was never set in `ci.yml` (and cannot be injected on the host: the name doesn't map to `runtimeConfig.public.sentry.release`). Now stamped with the commit SHA.
- **The `production` environment did not exist** — `deploy.yml` declared `environment: production`, but the repo had **zero** environments, so there was no approval gate at all: GitHub silently auto-creates an unprotected environment on first run. A declared environment is not a configured one. Now created via the API with **required reviewer `dstN`**, a **`master`-only deployment branch policy**, and `prevent_self_review: false` (a sole reviewer who is also the pusher could otherwise never approve). Environments live in repo settings, not in the repo — they are **not** restored by cloning or reverting, so re-create them by hand if the repo is forked or migrated.
- **No deploy secrets were configured** — all six (`DEPLOY_HOST/USER/SSH_KEY/PATH/DOMAIN`, `DATABASE_URL`) were unset. Worse than a plain failure: with `DATABASE_URL` empty, `drizzle.config.ts` falls back to its **localhost dev URL**, so the migrate step fails looking like a database problem. Added a preflight step that names the missing secrets and aborts in seconds.
- **Ground truth was stale** — §12 listed the coverage gate, audit gate and Dependabot as missing though all had shipped; counts corrected (25 pages, 33 endpoints, 387 keys).

Verified **not** a problem despite looking like one: `ci.yml` sets `NODE_ENV: test` workflow-wide, but `nuxt build` calls `overrideEnv('production')`, so HSTS and the `secure` session-cookie flag are baked correctly in the shipped artifact.

- **Tests ran on the wrong database engine** — CI used `mariadb:11` while production and local dev were both MySQL (prod confirmed **8.4.11**). Given the raw `JSON_EXTRACT`/`JSON_UNQUOTE` and `MATCH … AGAINST` SQL on core read paths, the suite could not tell you whether ingredient search behaves in production. CI, E2E and `docker-compose.yml` pinned to `mysql:8.4`; engine corrected across all docs (see §13).
- **DB reachability confirmed** — the production MySQL host answers on 3306 from an arbitrary external IP, so the runner-based migration step works and no SSH fallback is needed. Note this also means the DB is publicly reachable and the password is the only control.

Also added: **deploy now waits on the `E2E` run for the same commit** and refuses to proceed unless it passed — previously a green `CI` could deploy while the only end-to-end coverage of the fork → GMR → merge flow was still running.

**Remaining owner actions (infra, not code):** Let's Encrypt SSL; Passenger env injection; UptimeRobot on `/api/health`; nightly `mysqldump` cron + restore drill. **Deferred:** no staging environment; dedicated component-mount tests.

---

## 16. Design System (2026-08-05)

`DESIGNBOOK.md` is the source of truth for how the app looks. This section records
what the consistency pass found and changed; the rules themselves live there.

### The measured drift

Styling had been decided per call site rather than centrally:

| Symptom            | Measured on the pre-pass tree                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Button sizes       | 4 sizes across 105 `UButton`s (`xs` 42, `sm` 27, `lg` 24, `xl` 3) with no rule mapping size to rank                       |
| Form-control width | `class="w-full"` on **9** controls, absent from **23** identical ones                                                     |
| Form-control size  | `lg` on login/register/contact, default elsewhere                                                                         |
| Page content width | **9** different caps (`max-w-xl` … `max-w-screen-2xl`) against a `max-w-7xl` header                                       |
| Page gutters       | flat `px-4` on pages vs `px-4 sm:px-6 lg:px-8` on the header → content misaligned with nav by up to 16px                  |
| Colour spelling    | **207** `text-[var(--ui-text-muted)]`-style arbitrary classes where Nuxt UI ships `text-muted`; **0** uses of the utility |
| Raw palette hues   | 8 `amber-*`/`orange-*` utilities competing with the brand ramp, plus ~15 hand-applied `text-*-700 dark:text-*-400` pairs  |
| Heading scale      | `h1` at `text-xl`, `text-2xl`, `text-3xl` and `text-5xl`                                                                  |
| Duplicated logic   | GMR status→colour map in 2 files; difficulty→colour in 3; nav-link classes byte-identical in 2                            |

**The `w-full` finding was the substantive one.** `UInput`/`UTextarea`/`UInputMenu`/
`UInputNumber` have an `inline-flex` **root** and `USelect`/`USelectMenu` an
`inline-flex` **base**, so a form control collapses to content width unless
something adds `w-full`. Login's inputs were ~20 characters wide; settings' were
full width. That is not a taste difference, it is a broken form.

### What changed centrally

- **`app/app.config.ts`** — `defaultVariants` for `button` (`md`/`primary`/`solid`),
  `badge` (`sm`/`neutral`/`subtle`), `card` (`outline`), `alert` (`subtle`); and
  `w-full` appended to the root/base slot of all six form controls. A
  standard-rank button is now `<UButton :label="…" />` with no props, and no call
  site passes `w-full` or `size` to a form control.
- **`app/assets/css/main.css`** — `.link` (the single in-text link style),
  `.tint-{success,warning,error,info,herb}` (the light/dark contrast pairs,
  collected from ~15 call sites), `--gm-macro-{protein,carbs,fat}` +
  `bg-macro-*`, and the dark-mode neutral-text lift (below).
- **New primitives** — `<CommonPageShell>` (3 widths, one gutter set),
  `<CommonPageHeader>`, `<CommonEmptyState>`, `<RecipeTagList>`,
  `<RecipeDifficultyBadge>`, `<LayoutFooterLinks>`, and `app/utils/ui.ts`
  (`GMR_STATUS_COLOR`, `DIFFICULTY_COLOR`, `TINT_CLASS`, `CARD_GRID`,
  `navLinkClass`).
- **Layouts** — `dashboard.vue`'s `<main>` no longer wraps content in its own
  `max-w-screen-2xl px-4 … py-8`; that wrapper fought each page's own cap and
  doubled the padding. All three layouts now share the same `h-dvh` shell, and
  `auth.vue` owns the `max-w-md` cap that two auth pages used to re-apply
  themselves (rendering narrower and 64px lower than login).

### Enforcement

`scripts/design-check.mjs` (`npm run design:check`, in `npm run lint` and its own
CI step) fails on nine mechanically-detectable rules: arbitrary `--ui-*` classes,
raw palette hues in template _or_ script, redundant `w-full`, `size` on a form
control, `size="xl"` on a button, a page root that isn't `<CommonPageShell>`,
layout classes on a page root, the retired link spelling, and the forbidden
"Pull Request" term. Each finding cites its design-book section. Lines may opt out
with a `design-check-ignore` marker; there is exactly one, on the schema comment
that states the naming rule.

### Three real a11y defects surfaced by verifying the work

All three had been shipping. The axe gate only fails on **critical**, and all
three were **serious** — logged to the console and ignored.

- **Dark-mode `text-dimmed` measured 3.74:1** on the card surface — below AA for
  the 12px meta text on `RecipeCard` (6 failing nodes on `/explore`). §1.6 of the
  design book claimed contrast was solved centrally, but the fix was light-mode
  only. Dark now lifts `--ui-text-muted`/`--ui-text-dimmed` one step each
  (slate-300/slate-400), keeping a three-tier hierarchy with all tiers over AA.
- **`.link` was distinguishable by colour alone** inside a paragraph
  (`link-in-text-block` on the imprint page) — a regression from this very pass,
  since the first `.link` draft underlined on hover only. Now always underlined,
  with a dialled-back `text-decoration-color` that goes solid on hover.
- **`<main>` was not keyboard-scrollable** (`scrollable-region-focusable` on
  `/help/glossary`). In this shell `<main>` is the only scroll container, so
  `tabindex="-1"` meant content could not be scrolled without a mouse — visible
  only on the one page whose content holds nothing focusable. Now `tabindex="0"`
  in all three layouts; the skip-link still works.

**axe is now at zero critical _and_ zero serious violations on every public page
in both colour schemes.** Keep it there — a logged "serious" is a defect that
ships.

### Bugs found and fixed along the way

- **`definePageMeta({ auth: true })` was dead metadata** on `/settings` and
  `/[username]/[slug]/gourmerge-requests/new`. Nothing reads `route.meta.auth` —
  there is no global middleware — so neither page had a client-side guard, and
  `/settings` also fell back to the `default` layout instead of the dashboard
  shell. The APIs are protected server-side, so nothing leaked; an anonymous
  visitor just got a broken page instead of a redirect. Both now use
  `middleware: 'auth'`.
- **The Metric/Imperial setting did nothing.** `users.preferred_measurement_system`
  was persisted by `/settings` and read by no read path: the entire conversion
  engine in `server/utils/units.ts` was reachable only from its own unit test.
  `by-slug` now resolves the viewer's preference and returns
  `displayQuantity`/`displayUnit` alongside the canonical pair (verified
  end-to-end: 250 g → 8.82 oz, canonical preserved). Conversion is server-side
  because the session cookie does not carry the preference — and the row is read
  fresh, so a preference change takes effect without re-login. `getBestDisplayUnit`
  also handles metric scaling (1200 g → 1.2 kg), so it runs for both systems.
- **`/settings` silently reset your preferences.** `preferredLocale` and
  `preferredMeasurementSystem` were in the form but never loaded from the profile,
  so both selects always rendered their hardcoded defaults — and because `save()`
  submits the whole form, editing your bio reset your language to German. Root
  cause was one layer down: `GET /api/users/[username]` never selected those
  columns (nor `email`) though `UserProfile` declared all three. Now selected and
  returned **only on your own profile**, so a public profile does not leak an
  email address. `preferredLocale` was also typed `'de' | 'en'`, predating the
  FR/IT rollout.

### Not changed, deliberately

The landing page keeps its display type scale (`text-5xl`…`text-7xl` hero) — it is
marketing copy, and the exception is documented in §1.4 rather than left implicit.
Explore's filter row and three other controls keep explicit widths; they sit in
horizontal clusters, not form columns, and §3.4 lists them exhaustively.
