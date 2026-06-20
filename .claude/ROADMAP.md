# GourMerge — Definitive Production Roadmap (v1)

> Companion to `ARCHITECTURE.md` (the absolute source of truth) and successor to `production_audit.md` (now stale). This roadmap reflects the **actual current state** verified against the code, and is the execution plan from here to a production-ready v1.

## Context

GourMerge is a git-like recipe platform ("Fork the recipe, merge the flavor"): recipes are repositories, with branches, snapshot commits, on-read diffs, forking, and **GourMerge Requests** (the project's mandatory term — "Pull Request"/PR/`pull_request`/`pullRequest` are **forbidden** everywhere per `ARCHITECTURE.md`).

The existing `production_audit.md` is **stale**: the uncommitted working tree has already implemented many items it lists as missing.

### Locked decisions (from stakeholder)

1. **Deployment:** Netcup **Webhosting** (shared hosting) running Node via **Apache + Phusion Passenger**, with a **separate MySQL server** (MariaDB-compatible). → No Docker in production; `docker-compose.yml` is **local-dev only**. No root, no Redis, no self-hosted daemons.
2. **No images / no uploads — text only.** Drop the entire `img::<uuid>` track. TipTap configured without image nodes. Ingredients identified by **real names** (from the `ingredients` master table + i18n), icons are decorative-only.
3. **Full git workflow is a v1 blocker:** fork + branch comparison + GourMerge Requests + merge all ship in v1.
4. **Observability:** Pino file logging (mandatory) + **Sentry.io** SDK + **UptimeRobot** on `/api/health`.
5. **Idiot-proof onboarding is a v1 blocker.** Layered + **opt-in, never forced** (offered, easy to reach, not in-your-face): a skippable concept explainer, a skippable & **re-runnable** interactive tour built on Nuxt UI primitives, a guided "first recipe" flow, and persistent contextual help. Git terms surfaced as **cooking aliases with the canonical term in a tooltip** (e.g. fork → "Eigene Version / Remix", commit → "Version speichern", branch → "Variante", merge → "zusammenführen"); **"GourMerge Request" stays as the mandated brand term**, explained in plain language. Git-savvy users can skip everything in one click.
6. **100% bilingual (DE + EN) from v1 — hard gate.** _Every_ user-facing string — UI, onboarding, tooltips/glossary, emails (verification/reset), error pages, toasts, SEO meta, validation messages — exists in both locales. Enforced by a **CI gate** (en/de key parity + no empty values) plus a **no-hardcoded-strings** lint/review rule. Divergent or missing translations **fail the build**. (User-generated recipe content stays in the author's language, per ARCHITECTURE §7.)

### Stack is fixed (do not substitute)

Nuxt 4 · Vue 3 Composition API (`<script setup lang="ts">`) · Nuxt UI v4 (Reka + Tailwind v4) · MariaDB · Drizzle ORM (`mysql2`) · TipTap 3 · `@nuxtjs/i18n` · `@vite-pwa/nuxt` · `nuxt-auth-utils` · Zod · `diff-match-patch-es`.

---

## Verified Current State (ground truth)

> **This section reflects June 2026.** For the live detailed status see `.claude/current_state.md`.

**Implemented (all phases 0–5 complete):**

- Auth: register, login, logout, email verification, password reset, session rotation, DB-backed rate limiting, CSRF
- Recipe CRUD: create (transactional), read, update metadata, delete (with FK cleanup for forks + cross-recipe GMRs)
- Editor: TipTap 3 WYSIWYG (no images), step translations (per-locale JSON), Markdown output, dirty-state guard via UModal
- Ingredients: autocomplete from Swiss BLV catalog (~2300+ entries), create-on-the-fly, locale-aware search
- Nutrition: per-serving + total nutrition facts panel (kcal, macros, fiber, micros)
- Branches: list, create, delete
- Commits: snapshot create, history timeline, on-read diff between any two commits
- Fork: deep-copy recipe + branches + head commit snapshot, forkCount++
- Stars: toggle star/unstar, starCount counter (atomic)
- Tags: attach/detach, filter in explore
- Explore: public browse with text search, difficulty/tag filter, sort (stars/newest/forks), pagination
- User profiles: public profile, settings (bio, locale, measurement, avatar)
- GourMerge Requests: full lifecycle — create, list, view with diff, comment, status transitions, three-way snapshot merge with conflict detection
- i18n: 4 locales (DE/EN/FR/IT), 377 keys in 4-way parity, CI gate active
- Onboarding: concept explainer, skippable/re-runnable interactive tour, contextual help, glossary page
- Observability: Pino logging, Sentry client + server, /api/health
- Security: CSRF, session rotation, DB-backed rate limiting, security headers, CSP, email verification, password reset, Zod validation
- PWA: icons generated, manifest, autoUpdate service worker
- Brand: SVG logo, orange primary color, DM Sans + JetBrains Mono fonts
- Delete recipe: from edit page UI with confirmation modal; cascade + FK pre-cleanup handled in API

**Not yet done (corrected against code, 2026-06-20):**

- Tests: **done** — 118 unit cases (97% coverage gate in CI) + 24 Playwright specs (API auth/recipes/merge, SSR + register journeys, axe a11y) via the `E2E` workflow. Dedicated component-mount tests deferred (covered by E2E)
- CI/CD: GitHub Actions **are configured** (`ci.yml` + `deploy.yml`); still missing: coverage enforcement + `npm audit` gate
- Passenger CD: `.htaccess` + `app.js` exist and `deploy.yml` **does** wire rsync + migrate + restart + smoke test; still missing: migrate exit-code check + production environment protection
- Prod safety (F1 pending): Pino log rotation, Sentry active capture, error-response `data` sanitization, transactional-email i18n
- (Vanilla Sugar curated entry — done, F3)

---

## SECTION 1 — Executive Assessment

- **Current maturity:** Advanced prototype / pre-alpha. Foundation, data model, and the _read_ side of the git model (branches, history, diff) are solid. The _write_ side (editor) and the entire _social/collaboration_ layer are absent.
- **Production readiness score: 38 / 100.** (Architecture 8/10, read-path features 7/10, core editor 1/10, social workflow 0/10, security hardening 4/10, infra/deploy 1/10, testing 0/10, observability 1/10.)
- **Biggest risks:**
  1. **No working editor** → product has no usable core loop today (#1 blocker).
  2. **GourMerge Request _merge_ semantics** (three-way snapshot merge + conflict handling) is the hardest unbuilt piece and the headline feature.
  3. **Shared-hosting constraints** (Passenger multi-process, MySQL connection caps, no Redis) make naive in-memory state and large pools dangerous.
  4. **No migrations** → `push` against a shared production DB risks data loss.
  5. **No tests + no CI** → every change to snapshot/diff/merge logic is unverified.
- **Architectural strengths:** Clean Nuxt 4 `app/` vs `server/` separation; snapshot-commit model (no deltas → simple diffs); pointer-based branches; metric-canonical unit storage; consistent Zod validation; i18n-first UI; correct `<UApp>`/Composition-API discipline.
- **Architectural weaknesses:** Editor write-path undefined; merge algorithm unspecified; denormalized counters (`starCount`/`forkCount`) have no maintenance path; rate-limit store won't survive multi-process Passenger; no transactional boundary documented for fork/merge; `ingredients` master table unused.

---

## SECTION 2 — Gap Analysis

| Area                                                    | Status           | Severity     | Missing Work                                                                                                                         | Est. Effort |
| ------------------------------------------------------- | ---------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| Recipe editor (TipTap + ingredients)                    | Stub             | Blocker      | Ingredient rows (autocomplete, qty/unit/notes), step list, TipTap WYSIWYG (no images), commit wiring, dirty-state guard              | 3–4 d       |
| Ingredients master + autocomplete                       | Missing          | Blocker      | `GET /api/ingredients?q=` search, create-on-the-fly, i18n names, autocomplete component                                              | 1.5 d       |
| Versioned migrations                                    | Missing          | Critical     | Switch `push`→`generate`+`migrate`; baseline migration; deploy-time migrate                                                          | 0.5 d       |
| Forking                                                 | Missing          | Blocker (v1) | Deep-copy recipe+branches+head commit snapshot; `forkedFromRecipeId`; bump `forkCount` txn                                           | 1.5 d       |
| Branch comparison                                       | Missing          | Blocker (v1) | Compare two branch heads (cross-recipe) reusing diff engine                                                                          | 1 d         |
| GourMerge Requests (create/list/view/comment/close)     | Missing          | Blocker (v1) | API + UI for full lifecycle; comments; status transitions                                                                            | 3 d         |
| GourMerge Request _merge_                               | Missing          | Blocker (v1) | Three-way snapshot merge, conflict detection, merge commit, status→merged, txn                                                       | 3–4 d       |
| Stars                                                   | Missing          | v1           | Star/unstar txn + counter; UI toggle; starred list                                                                                   | 1 d         |
| User profiles                                           | Missing          | v1           | `/[username]` profile (recipes/forks/stars/bio), settings page                                                                       | 1.5 d       |
| Explore / search                                        | Missing          | v1           | `/explore` public browse: search, filter (difficulty/tags), sort (stars/new)                                                         | 2 d         |
| Tags                                                    | Missing          | v1           | Tag CRUD on recipe, tag filter, i18n tag names                                                                                       | 1 d         |
| Auth hardening (CSRF/session rotation)                  | Missing          | Critical     | Enable CSRF, rotate session post-login, secure cookie flags for prod                                                                 | 1 d         |
| Email verification                                      | Missing          | v1           | Token table, SMTP send, verify endpoint, gate sensitive actions                                                                      | 1.5 d       |
| Password reset                                          | Missing          | v1           | Request/confirm flow, token table, SMTP, rate-limited                                                                                | 1 d         |
| Rate limiting (multi-process safe)                      | In-memory        | v1           | DB-backed limiter (no Redis on host); extend to mutations                                                                            | 1 d         |
| Global error sanitization                               | Missing          | Critical     | Nitro `error` hook → sanitized JSON in prod, no stack leaks                                                                          | 0.5 d       |
| Security headers / CSP / CORS                           | Missing          | Critical     | `routeRules` headers, CSP (TipTap-safe), HSTS, same-origin policy                                                                    | 1 d         |
| Secrets management                                      | Leaked dev creds | Critical     | Rotate, untrack `.env`, document Passenger env injection                                                                             | 0.5 d       |
| Structured logging (Pino)                               | Missing          | v1           | Pino to rotating file, request IDs, redaction                                                                                        | 1 d         |
| Error tracking (Sentry.io)                              | Missing          | v1           | SDK on client+server, DSN env, release tagging                                                                                       | 0.5 d       |
| Health/uptime                                           | Exists           | Low          | `/api/health` exists; wire UptimeRobot                                                                                               | 0.25 d      |
| PWA assets + offline                                    | Missing          | v1           | Create `public/`, icons, favicon, apple-touch, manifest, offline shell                                                               | 1 d         |
| Onboarding & first-run experience                       | Missing          | Blocker (v1) | Opt-in layered tour (skippable + re-runnable), concept explainer, guided first recipe, contextual help; onboarding state persistence | 2.5–3 d     |
| Terminology/glossary layer (cooking aliases + tooltips) | Missing          | v1           | `glossary` i18n namespace + reusable `<GlossaryTerm>`/`<HelpHint>`; adopt across all features as built                               | 1 d         |
| Bilingual completeness (DE+EN) + i18n CI gate           | Partial          | Blocker (v1) | Key-parity + empty-value CI check, no-hardcoded-string lint, full DE+EN for every string incl. emails/errors/SEO/onboarding          | 1.5 d       |
| Accessibility                                           | Missing          | v1           | ARIA, keyboard nav, focus traps in modals, contrast, SR pass                                                                         | 1.5 d       |
| SEO / schema.org                                        | Missing          | Low          | Per-recipe meta/OG, Recipe JSON-LD, sitemap, robots                                                                                  | 1 d         |
| Testing (unit/component/API/E2E)                        | None             | Critical     | Vitest + `@nuxt/test-utils` + Playwright; coverage on diff/merge/units                                                               | 3–4 d       |
| Linting/formatting                                      | None             | v1           | ESLint (`@nuxt/eslint`) + Prettier + typecheck gate                                                                                  | 0.5 d       |
| CI/CD                                                   | None             | Critical     | GitHub Actions: lint→typecheck→test→build→deploy (SFTP/SSH)→migrate→restart                                                          | 1.5 d       |
| Passenger deployment                                    | Missing          | Critical     | Startup file, `.htaccess`, `node-server` preset, restart hook, SSL                                                                   | 1 d         |
| DB connection tuning for shared host                    | pool=10          | v1           | Lower pool (≈3–5), per-process awareness, timeouts                                                                                   | 0.25 d      |
| Counter integrity (star/fork)                           | Manual           | v1           | Always update in same txn; reconcile script                                                                                          | 0.5 d       |
| Toasts / UX feedback                                    | Missing          | Low          | `useToast()` on all mutations                                                                                                        | 0.5 d       |
| README / docs                                           | Missing          | Low          | Setup, deploy, contributing                                                                                                          | 0.5 d       |
| Notifications, collections, export, SSR cache           | Missing          | Post-v1      | Out of v1 scope                                                                                                                      | —           |

---

## SECTION 3 — Master Delivery Roadmap

### PHASE 0 — Stabilize Foundation & Safety Nets

- **Goal:** Make the repo safe to build on before adding features.
- **Deliverables:** Commit current WIP on a feature branch; switch Drizzle to `generate`+`migrate` with a baseline migration; Nitro global error sanitization; rotate & untrack secrets; ESLint+Prettier+typecheck; **i18n bilingual CI gate (DE/EN key parity + no-empty-values + no-hardcoded-strings lint)**; Vitest + Playwright scaffolding; lower DB pool for shared host; README skeleton.
- **Dependencies:** None.
- **Risks:** Baseline migration must exactly match the already-`push`ed schema (introspect to verify) or production drifts.
- **Acceptance:** `db:generate` produces a baseline matching live schema; `npm run lint`, `typecheck`, `test`, `build` all pass; the **i18n gate fails CI on any DE/EN divergence**; no stack traces leak in prod mode; `.env` untracked, dev creds rotated.

### PHASE 1 — Core Editor & Ingredients (UNBLOCK THE PRODUCT)

- **Goal:** A user can fully author a recipe's ingredients + steps and commit a snapshot.
- **Deliverables:** `ingredients` search/create API + autocomplete component; functional ingredient rows (name, qty, unit, notes, reorder); TipTap step editor (no images, SSR-safe, Markdown out); wire `edit.vue` → `POST /commits`; dirty-state navigation guard; toasts; **terminology/glossary foundation (`<GlossaryTerm>`/`<HelpHint>` + `glossary` i18n namespace) so every feature uses cooking-aliases + canonical-term tooltips from day one** (prevents a costly retrofit later).
- **Dependencies:** Phase 0.
- **Risks:** TipTap SSR hydration; Markdown round-trip fidelity vs diff engine.
- **Acceptance:** Create recipe → add ≥3 ingredients via autocomplete + ≥3 Markdown steps → commit → detail page renders them → diff against previous commit is correct.

### PHASE 2 — Auth Hardening & Account Lifecycle

- **Goal:** Production-grade authentication.
- **Deliverables:** CSRF enabled; session rotation post-login; secure cookie flags; DB-backed rate limiting on auth + mutations; email verification (SMTP via Netcup); password reset; verification-gated sensitive actions.
- **Dependencies:** Phase 0 (migrations for token tables), SMTP creds.
- **Risks:** SMTP deliverability on shared hosting; rate-limit accuracy across Passenger processes.
- **Acceptance:** Forged cross-site POST rejected; session cookie value changes after login; >N auth attempts throttled (DB-backed); register → confirm email; reset flow round-trips.

### PHASE 3 — Social Graph: Fork, Stars, Profiles, Explore, Tags

- **Goal:** Platform discovery & ownership features.
- **Deliverables:** Fork (deep-copy txn + `forkCount`); stars (txn + `starCount`) + UI; `/[username]` profile; settings page (bio, locale, measurement system); `/explore` (search/filter/sort); tags CRUD + filtering.
- **Dependencies:** Phase 1.
- **Risks:** Reserved-username collisions with `/explore`, `/settings`; counter drift.
- **Acceptance:** Fork creates independent recipe linked via `forkedFromRecipeId`, head snapshot copied, counter +1; star toggles consistent; profile lists owned/forked/starred; explore filters/sorts; tags attach/detach/filter.

### PHASE 4 — GourMerge Requests & Merge (HEADLINE FEATURE)

- **Goal:** End-to-end propose-review-merge across branches/forks.
- **Deliverables:** Branch comparison (cross-recipe) reusing diff engine; GourMerge Request create/list/view; comments; status lifecycle (draft/open/closed/merged); **three-way snapshot merge** with conflict detection; merge commit; transactional merge + status + counters.
- **Dependencies:** Phases 1 & 3.
- **Risks:** Merge correctness/conflicts is the highest-risk algorithm — must be heavily tested; concurrent merges; atomic head advance.
- **Acceptance:** Fork → edit on a branch → open GourMerge Request to upstream → owner sees diff + comments → merge produces a new commit on target with combined snapshot; conflicting edits surface a clear conflict state instead of silent loss; merged GourMerge Request is immutable.

### PHASE 5 — Observability, PWA, SEO, A11y Polish

- **Goal:** Operable, installable, discoverable, accessible.
- **Deliverables:** Pino rotating file logs + request IDs + redaction; Sentry.io (client+server); UptimeRobot on `/api/health`; PWA icons/favicon/`public/` + offline shell; per-recipe SEO meta/OG + Recipe JSON-LD + sitemap/robots; accessibility pass; responsive audit; dark-mode persistence check.
- **Dependencies:** Features stable (Phases 1–4).
- **Risks:** CSP must allow TipTap/Sentry without weakening XSS protection; PWA caching stale content.
- **Acceptance:** Errors appear in Sentry with release tags; logs rotate without filling quota; Lighthouse PWA installable; key pages pass axe with no critical violations; recipe pages emit valid Recipe structured data.

### PHASE 5.5 — Onboarding & Bilingual Completeness (release gate)

- **Goal:** A first-time, non-technical cook understands and succeeds without help; every string is DE+EN.
- **Deliverables:** Onboarding state persistence (`users.onboardingCompletedAt` + dismissed flag); skippable concept explainer (git-for-recipes in plain DE/EN); **opt-in, skippable, re-runnable** interactive tour (Nuxt UI primitives + `useProductTour()` composable); guided "create your first recipe" flow + rich empty states; persistent contextual help (`?` menu + per-feature `<HelpHint>` on fork/branch/commit/merge/GourMerge Request); **full DE+EN content audit** across UI, onboarding, glossary, emails, errors, toasts, SEO meta, validation.
- **Dependencies:** Phases 1–4 (all flows must exist to tour them) + the Phase 1 glossary foundation + the Phase 0 i18n gate.
- **Risks:** Tour fragility if it targets unstable DOM (anchor to stable `data-tour` attributes, not CSS); over-forcing the tour (must stay opt-in); translation drift (the CI gate guards this).
- **Acceptance:** New user can go signup → first recipe → understand fork/GourMerge Request **without external help**; tour is skippable in one click, dismissable, and re-runnable from the help menu; git-savvy users are never blocked; **i18n CI gate green with both locales 100% complete** (incl. all onboarding/glossary/email strings); switching DE↔EN shows no missing keys anywhere.

### PHASE 6 — CI/CD, Passenger Deployment, Launch

- **Goal:** Repeatable build→test→deploy to Netcup with rollback.
- **Deliverables:** GitHub Actions pipeline (lint→typecheck→test→build); deploy job (SFTP/rsync of `.output` + prod deps) → run migrations against MySQL → `touch tmp/restart.txt`; Passenger startup file + `.htaccess`; Let's Encrypt SSL; env injection; backup strategy (MySQL dumps); rollback runbook; final readiness checklist (Section 10).
- **Dependencies:** All prior phases.
- **Risks:** Building on the host is infeasible → must build in CI and ship artifact; Passenger startup path for Nitro `node-server`; multi-process env consistency.
- **Acceptance:** Push to `master` → green pipeline → artifact deployed → migrations applied → app restarts → smoke test passes over HTTPS; documented rollback restores previous artifact + DB.

---

## SECTION 4 — Detailed Sprint Backlog

> Priority: P0 = blocker, P1 = v1-required, P2 = v1-polish.

### Phase 0 — Foundation

- **P0-001 — Branch & commit WIP.** P0. Create `feature/*` branch, commit current uncommitted work in logical chunks. _Test:_ build passes.
- **P0-002 — Versioned migrations.** P0. Switch to `drizzle-kit generate`+`migrate`; introspect live DB to author a **baseline** matching current schema; remove `push` from any deploy path. _Files:_ `drizzle.config.ts`, `server/database/migrations/*`. _Test:_ migrate on fresh DB reproduces schema.
- **P0-003 — Nitro global error handler.** P0. Server plugin / `nitro` `'error'` hook: log full error, return sanitized message in production. _Files:_ new server plugin, `nuxt.config.ts`. _Test:_ forced error returns generic body in prod build.
- **P0-004 — Secrets hygiene.** P0. Untrack `.env`, `.gitignore` it, rotate leaked dev DB password + session secret, expand `.env.example`. _Test:_ `git ls-files` shows no `.env`.
- **P0-005 — Lint/format/typecheck.** P1. Add `@nuxt/eslint` + Prettier; scripts `lint`, `format`. _Test:_ `npm run lint` clean.
- **P0-006 — Test scaffolding.** P0. Add Vitest + `@nuxt/test-utils` + Playwright; sample unit tests for `units.ts`, `diff.ts`. _Test:_ `npm test` green.
- **P0-007 — DB pool tuning for shared host.** P1. Lower `connectionLimit` (≈3–5), add `connectTimeout`, document per-process multiplication under Passenger. _Files:_ `server/utils/drizzle.ts`.
- **P0-008 — README skeleton.** P2. Setup/dev/deploy outline. _Files:_ `README.md`.
- **P0-009 — UUIDv7 `public_id` columns.** P1. Add `public_id BINARY(16)` unique on `recipes` + `gourmerge_requests`; generate app-side via `uuidv7` package on insert; resolve external lookups by `public_id` while keeping INT PK/FK internal. _DB:_ columns + unique index (part of step-7 migration wave). _Files:_ `server/database/schema.ts`, `package.json` (`uuidv7`), insert handlers, by-id resolvers. _Test:_ round-trip BINARY(16)↔string; insert ordering keeps index dense; no integer enumeration in responses. **Tokens stay CSPRNG — not v7.**
- **P0-010 — i18n bilingual CI gate + no-hardcoded-strings.** P0. Script comparing `i18n/locales/en.json` vs `de.json`: fail on any key present in one but not the other, or any empty/placeholder value; add an ESLint rule (e.g. `@intlify/vue-i18n` or `no-literal-string`) forbidding raw user-facing strings in templates/`.ts`. Wire into `npm run lint` + CI. _Files:_ `scripts/i18n-check.mjs`, `eslint.config.mjs`, `package.json`, `.github/workflows/ci.yml`. _Test:_ gate fails on an intentionally removed/empty DE key; passes when parity restored.

### Phase 1 — Editor & Ingredients

- **P1-001 — Ingredient search API.** P0. `GET /api/ingredients?q=&locale=`: search master table by name + `nameTranslations`. _DB:_ `ingredients` (add fulltext/prefix index). _Test:_ query + locale fallback.
- **P1-002 — Ingredient create-on-write.** P0. Create new master ingredient (deduped by normalized name) during commit if not found (txn). _Test:_ dedupe + race safety.
- **P1-003 — `IngredientAutocomplete` component.** P0. `UInputMenu`/async search wrapper; emits selected ingredientId or new name. _UI:_ `app/components/recipe/IngredientAutocomplete.vue`.
- **P1-004 — Ingredient row editor.** P0. Rows with autocomplete, quantity, unit (i18n labels), notes, drag-reorder (`sortOrder`). _UI:_ `edit.vue` + `IngredientRow.vue`.
- **P1-005 — TipTap step editor (no images).** P0. `<ClientOnly>` + `immediatelyRender:false`; StarterKit + `@tiptap/markdown`; **image extension disabled**; Markdown per step. _UI:_ `app/components/recipe/StepEditor.vue`. _Test:_ Markdown round-trips; SSR no-hydration-mismatch.
- **P1-006 — Wire editor → commit.** P0. Collect ingredients[]+steps[]+message → `POST /api/recipes/:id/commits`; advance branch head; toast + redirect. _Test:_ E2E author→commit→render.
- **P1-007 — Dirty-state guard.** P1. `onBeforeRouteLeave` confirm if unsaved.
- **P1-008 — Detail-page rendering refinement.** P1. Render ingredient by **name** (+ optional decorative icon), Markdown steps → safe HTML. _UI:_ `[username]/[slug]/index.vue`.
- **P1-009 — Toasts util.** P1. Standard success/error `useToast()` wrapper.
- **P1-010 — Terminology/glossary foundation.** P1. Add `glossary` i18n namespace (cooking-alias + plain-language definition per git term, DE+EN) and reusable `<GlossaryTerm>` (renders friendly alias, canonical term in `UTooltip`) + `<HelpHint>` (`?` icon → `UPopover` explanation). Adopt across editor/branches/history as they're built so aliases are consistent from the start. _Files:_ `app/components/common/GlossaryTerm.vue`, `HelpHint.vue`, `i18n/locales/*`. _Test:_ component renders alias + tooltip; both locales resolve.

### Phase 2 — Auth Hardening

- **P2-001 — Enable CSRF.** P0. Turn on CSRF (nuxt-auth-utils/nitro), attach token to forms/fetch. _Test:_ cross-origin POST 403; same-origin OK.
- **P2-002 — Session rotation.** P0. Regenerate session after login/register. _Files:_ auth routes. _Test:_ cookie value changes post-auth.
- **P2-003 — Secure cookie flags (prod).** P0. `secure`, `httpOnly`, `sameSite=lax`, correct domain behind Passenger/HTTPS.
- **P2-004 — DB-backed rate limiting.** P1. Replace in-memory `rateLimit.ts` with `rate_limit_hits` table keyed by ip+route+window; apply to auth + write endpoints. _DB:_ new table.
- **P2-005 — Email verification.** P1. `email_verification_tokens` table; SMTP send; `GET/POST /api/auth/verify`; `users.emailVerifiedAt`. _DB:_ new column + table.
- **P2-006 — Password reset.** P1. `password_reset_tokens`; request + confirm endpoints; rate-limited; SMTP; no user enumeration. _DB:_ new table.
- **P2-007 — Gate sensitive actions on verification.** P2. Block publishing/GourMerge Request until verified (configurable).

### Phase 3 — Social Graph

- **P3-001 — Fork API.** P0. `POST /api/recipes/:id/fork`: txn deep-copy recipe meta + branches + head commit snapshot; set `forkedFromRecipeId`; `forkCount+1`. _Test:_ fork independence + counter.
- **P3-002 — Fork UI.** P1. Button on recipe detail. _UI:_ `index.vue`, `RecipeCard`.
- **P3-003 — Stars API.** P1. `POST/DELETE /api/recipes/:id/star` txn with `starCount`; unique `(recipeId,userId)`. _DB:_ `recipe_stars`.
- **P3-004 — Stars UI.** P1. Toggle on card/detail; starred list.
- **P3-005 — User profile page.** P1. `/[username]` index: bio, recipes, forks, stars, counts. _API:_ `GET /api/users/:username`.
- **P3-006 — Settings page.** P1. Edit displayName/bio/avatarUrl(text URL only)/locale/measurement system. _API:_ `PATCH /api/users/me`.
- **P3-007 — Explore page + search API.** P1. `GET /api/recipes/explore?q=&difficulty=&tag=&sort=`: public only, paginated. _DB:_ search/sort indexes.
- **P3-008 — Tags API + UI.** P1. List/attach/detach tags; create (deduped); filter. _DB:_ `tags`,`recipe_tags`.
- **P3-009 — Reserved-path extension.** P1. Add `explore`,`settings` to `validate-recipe-route.ts`.
- **P3-010 — Counter reconcile script.** P2. One-off/scheduled recompute of star/fork counts.

### Phase 4 — GourMerge Requests & Merge

- **P4-001 — Branch comparison API.** P0. `GET /api/recipes/:id/compare?source=&target=`: resolve both heads, reuse `computeCommitDiff`.
- **P4-002 — Create GourMerge Request.** P0. `POST /api/recipes/:id/gourmerge-requests`. _DB:_ `gourmerge_requests`.
- **P4-003 — List/view GourMerge Requests.** P1. `GET .../gourmerge-requests` + `GET .../:gmrId` with computed diff. _UI:_ `/[username]/[slug]/gourmerge-requests` + detail.
- **P4-004 — Comments.** P1. `POST/GET .../:gmrId/comments` (Markdown). _DB:_ `gm_request_comments`.
- **P4-005 — Status lifecycle.** P1. Transitions draft↔open→closed/merged with guards. _API:_ `PATCH .../:gmrId`.
- **P4-006 — Three-way snapshot merge.** P0. `server/utils/merge.ts`: base = common ancestor (walk `parentCommitId` app-side), compare source/target against base, auto-merge non-conflicting changes, **detect conflicts**. _Test:_ extensive matrix (clean, add/add, edit/edit conflict, delete/edit, reorder).
- **P4-007 — Merge execution endpoint.** P0. `POST .../:gmrId/merge`: one txn → merged snapshot → new commit on target → advance head → status `merged` → block on conflicts. _Test:_ atomicity, conflict abort, post-merge immutability.
- **P4-008 — Merge UI + conflict view.** P1. Merge button (owner only), conflict presentation reusing diff styles. _Test:_ E2E fork→edit→request→merge.

### Phase 5 — Observability / PWA / SEO / A11y

- **P5-001 — Pino logging.** P1. Rotating file logs (quota-aware), request-id, redact secrets/cookies. _Files:_ `server/utils/logger.ts`.
- **P5-002 — Sentry.io.** P1. `@sentry/nuxt` client+server, DSN env, release+environment tags, PII scrubbing.
- **P5-003 — Health + UptimeRobot.** P2. Confirm `/api/health` checks DB; register external monitor.
- **P5-004 — PWA assets.** P1. Create `public/` with icons, favicon, apple-touch; validate manifest.
- **P5-005 — Offline shell.** P2. Workbox runtime caching for shell + viewed recipes (read-only).
- **P5-006 — SEO meta + JSON-LD.** P2. `useSeoMeta` per recipe + Recipe schema.org JSON-LD; sitemap; robots.
- **P5-007 — Accessibility pass.** P1. ARIA, modal focus traps, keyboard nav, contrast, `aria-hidden` on decorative icons. _Test:_ axe no critical issues.
- **P5-008 — Responsive + dark-mode persistence.** P2. Mobile audit (sidebar collapse); color-mode persisted via cookie.

### Phase 5.5 — Onboarding & Bilingual Completeness

- **P5-009 — Onboarding state persistence.** P1. Add `users.onboardingCompletedAt DATETIME NULL` (+ optional `tourDismissed` flag); for logged-out previews fall back to a cookie. _DB:_ column (step-7 migration wave). _API:_ `PATCH /api/users/me` extended. _Test:_ completing/skipping persists; never re-forced.
- **P5-010 — Concept explainer (skippable).** P1. First-login welcome modal/page explaining "git for recipes" in plain DE/EN with the cooking-alias mapping; **Skip** + "Don't show again"; git-savvy users dismiss in one click. _UI:_ `app/components/onboarding/ConceptIntro.vue`. _Test:_ shows once, skip persists.
- **P5-011 — Interactive guided tour.** P1. `useProductTour()` composable driving Nuxt UI `UPopover`/overlay steps anchored to stable `data-tour` attributes; **opt-in, skippable, re-runnable** from the help menu; not auto-forced beyond first gentle offer. _UI:_ `useProductTour.ts`, `TourStep.vue`, `data-tour` attrs on key elements. _Test:_ start/skip/resume/replay; SSR-safe (client-only); anchors resolve.
- **P5-012 — Guided "first recipe" + empty states.** P1. Hand-held create-first-recipe path + rich empty states (dashboard/explore/history) that teach next actions. _UI:_ `dashboard.vue`, `recipes/new.vue`, editor. _Test:_ empty-state CTAs route correctly; guided flow completes.
- **P5-013 — Persistent contextual help.** P1. Global `?` help menu (links to concept intro + replay tour + glossary) and `<HelpHint>` on fork/branch/commit/merge/GourMerge Request controls. _UI:_ layout header + feature components. _Test:_ help reachable from every authenticated page.
- **P5-014 — Bilingual content completeness pass.** P0. Audit **every** string (UI, onboarding, glossary, emails, errors, toasts, SEO meta, validation) for DE+EN; fix all gaps until the P0-010 gate is green. _Files:_ `i18n/locales/*`, email templates, `error.vue`, SEO composables. _Test:_ i18n gate green; manual DE↔EN switch shows zero missing keys.

### Phase 6 — CI/CD & Deploy

- **P6-001 — Security headers / CSP / CORS.** P0. `routeRules` headers: CSP (TipTap + Sentry + fonts), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, frame-ancestors; same-origin API.
- **P6-002 — Nitro `node-server` preset + Passenger startup.** P0. Configure preset; Passenger startup file → `.output/server/index.mjs`; `.htaccess` (`PassengerAppType node`, `PassengerStartupFile`, `PassengerAppEnv production`).
- **P6-003 — CI pipeline.** P0. GitHub Actions: install→lint→typecheck→test→build artifact. _Files:_ `.github/workflows/ci.yml`.
- **P6-004 — CD deploy job.** P0. On `master`: SFTP/rsync artifact to Netcup, run `drizzle-kit migrate` against MySQL (CI secrets), `touch tmp/restart.txt`. _Files:_ `.github/workflows/deploy.yml`.
- **P6-005 — SSL + env injection.** P0. Let's Encrypt via Netcup panel; inject `DATABASE_URL`, `NUXT_SESSION_PASSWORD`, `SENTRY_DSN`, SMTP creds via Passenger env/`.htaccess`.
- **P6-006 — Backup + rollback.** P1. Scheduled `mysqldump` (Netcup cron) retained N days; keep previous artifact for instant rollback; runbook. _Files:_ `docs/RUNBOOK.md`.
- **P6-007 — Launch checklist execution.** P0. Walk Section 10.

---

## SECTION 5 — Database Impact Review

**Current schema is well-designed** and already carries the required versioning indexes (branch_id, parent_commit_id, commit_ingredients.commit_id, commit_steps.commit_id, gourmerge_requests source/target). Snapshot-based commits and pointer branches comply with ARCHITECTURE §6.

### Identifier strategy — INT PK + UUIDv7 `public_id` (performance + opacity)

**Decision:** Keep `INT UNSIGNED AUTO_INCREMENT` as the **internal** PK / FK target (mandated by ARCHITECTURE §6, and already the dense, sequential "best case" for B-tree indexes — no page-split penalty, smallest FKs, fastest joins). Add a **`public_id` UUIDv7 column** as the **external** identifier on shareable/linkable entities, so we never expose enumerable sequential integers in URLs/APIs.

_Why UUIDv7 specifically, and why it doesn't hurt:_ a random UUIDv4 secondary index suffers constant page splits, ~2× index size, slower inserts (the randomness problem). **UUIDv7 stores a 48-bit Unix-millisecond timestamp in its leading bytes**, so generated IDs are time-ordered and append near the right edge of the index — keeping the `public_id` index dense and insert-cheap, while remaining globally unique and unguessable-enough for opaque references.

_MariaDB-correct implementation (not Postgres):_

- Store `public_id` as **`BINARY(16)`** (16 bytes, not a 36-char string) with a **unique index**; expose as canonical UUID string at the API boundary.
- **Generate in app code** (`uuidv7` npm package) rather than relying on a SQL `UUID_v7()` function — Netcup's MySQL server version is outside our control, so app-side generation is portable and version-independent. (If the server is confirmed MariaDB ≥ 11.7, `UUID_v7()` is an option, but app-side stays the default.)
- Apply to externally-referenced entities: **`recipes`** and **`gourmerge_requests`** at minimum; pattern is extensible to `users`/`branches`/`commits` if/when those get external references. Recipes also keep slug+username URLs; `public_id` backs API/`:id` lookups so internal integers never leak.

_Security caveat (do NOT apply v7 here):_ `email_verification_tokens` and `password_reset_tokens` must use **CSPRNG random tokens (hashed at rest)**, never UUIDv7 — v7's predictable timestamp prefix would weaken token unguessability. v7 is for identifiers, not secrets.

### New tables (all via `drizzle-kit generate`, never `push` in prod)

1. `email_verification_tokens` (id, userId FK, tokenHash, expiresAt, usedAt) — idx userId, unique tokenHash.
2. `password_reset_tokens` (id, userId FK, tokenHash, expiresAt, usedAt) — idx userId, unique tokenHash.
3. `rate_limit_hits` (id, bucketKey, windowStart, count) — unique (bucketKey, windowStart); needed because in-memory state can't be shared across Passenger processes (no Redis).

### Column additions

- `users.emailVerifiedAt DATETIME NULL`.
- `users.onboardingCompletedAt DATETIME NULL` (+ optional `tour_dismissed BOOLEAN DEFAULT false`) — drives the opt-in onboarding so it's never re-forced (P5-009).
- _(optional)_ `recipe_commits.is_merge BOOLEAN DEFAULT false` + `recipe_commits.merge_source_commit_id INT NULL` — record merge provenance (the second logical parent of a merge commit).
- `recipes.public_id` + `gourmerge_requests.public_id` — `BINARY(16)` unique (UUIDv7, see Identifier strategy).

### Missing indexes (add)

- `recipes.title` + `recipes.description` — **FULLTEXT** (or prefix) for `/explore` search; plus composite `(visibility, starCount)` and `(visibility, createdAt)` for sort.
- `ingredients.name` — ensure prefix/FULLTEXT for autocomplete supports `LIKE 'q%'`/MATCH.
- `gm_request_comments.gm_request_id` — confirm exists.

### Constraints

- Keep all FK cascades. Existing unique guards: `recipe_stars (recipeId,userId)`, `recipe_tags (recipeId,tagId)`, `recipe_branches (recipeId,name)`. Add **app-level** guard: cannot delete `isDefault` branch (enforced) and cannot delete a branch referenced as a GourMerge Request source/target while open.

### Migrations

- **Baseline migration** capturing current live schema is the #1 prerequisite (P0-002). Introspect the pushed DB to avoid drift. All subsequent changes are forward migrations applied in CD.

### Performance / scaling risks (shared MySQL)

- **Connection cap:** shared MySQL limits concurrent connections; Passenger runs multiple processes each with its own pool → small pool (≈3–5) + idle timeouts.
- **History traversal:** never recursive CTEs (ARCHITECTURE §6.3) — walk `parentCommitId` app-side; paginate (history already limited to 50).
- **Diff/merge on read:** fine at v1 scale; consider lazy step loading only if recipes grow huge.
- **Denormalized counters:** update in the **same transaction** as the star/fork insert/delete; reconcile script (P3-010) repairs drift.
- **Explore queries:** hit indexes (visibility + sort column); avoid `SELECT *`; paginate.

---

## SECTION 6 — Security Hardening Plan

For each: **Why · How (Nuxt 4) · Test.**

1. **Rate limiting** — _Why:_ prevents brute-force/credential-stuffing. _How:_ DB-backed limiter (no Redis) keyed by IP+route+window on auth + mutations; trust `x-forwarded-for` only from known proxy. _Test:_ threshold → 429; holds across two processes.
2. **CSRF** — _Why:_ cookie-session is vulnerable to cross-site POST. _How:_ enable nuxt-auth-utils/nitro CSRF; same-origin token on state-changing fetches. _Test:_ forged cross-origin POST → 403.
3. **Session rotation** — _Why:_ prevents session fixation. _How:_ regenerate session after login & register. _Test:_ cookie value differs pre/post auth.
4. **Email verification** — _Why:_ stops fake accounts, enables trusted reset. _How:_ hashed token table + SMTP + verify endpoint + `emailVerifiedAt`. _Test:_ issue→confirm→expire/single-use.
5. **Password reset** — _Why:_ recovery without support. _How:_ hashed single-use short-TTL token, rate-limited, generic responses (no enumeration). _Test:_ round-trip; reused/expired rejected; identical response for unknown email.
6. **Input validation** — _Why:_ integrity & injection defense. _How:_ Zod on every body/query; reject unknown keys; length caps matching DB. _Test:_ malformed → 400.
7. **Authorization review** — _Why:_ prevent IDOR/escalation. _How:_ every mutating + private-read endpoint checks ownership/visibility (private → 404); merge restricted to target-recipe owner. _Test:_ cross-user 404/403 matrix.
8. **CSP** — _Why:_ mitigate XSS (user Markdown). _How:_ `routeRules` CSP allowing only required sources (self, fonts, Sentry); sanitize rendered Markdown; no `unsafe-eval`. _Test:_ injected `<script>` in a step doesn't execute; report-only first, then enforce.
9. **Security headers** — _Why:_ defense-in-depth. _How:_ HSTS, `nosniff`, `Referrer-Policy`, `frame-ancestors 'none'`, `Permissions-Policy`. _Test:_ header assertions + securityheaders.com scan.
10. **Cookie settings** — _Why:_ protect session. _How:_ `httpOnly`, `secure`, `sameSite=lax`, host-scoped; HTTPS enforced. _Test:_ prod response headers.
11. **Secrets management** — _Why:_ a dev password is currently exposed. _How:_ untrack `.env`, rotate session secret + DB password, inject via Passenger env/CI secrets. _Test:_ `git ls-files` clean; app boots from injected env.
12. **Audit logging** — _Why:_ trace abuse & incidents. _How:_ Pino structured logs for auth events, merges, deletes, with request id + user id (no PII/passwords). _Test:_ events present + redacted.
13. **Dependency scanning** — _Why:_ known-CVE supply chain. _How:_ `npm audit` + Dependabot in CI; fail on high severity. _Test:_ CI step reports.

---

## SECTION 7 — Testing Strategy

**Tooling:** Vitest (unit) · `@nuxt/test-utils` + `@vue/test-utils` (component/Nuxt env) · Vitest + Nitro handler / `$fetch` (API/integration) · Playwright (E2E) · `@vitest/coverage-v8`. CI runs all on every push.

**Layers, priorities, coverage:**

1. **Unit (P0):** `units.ts`, `slug.ts`, `diff.ts`, **`merge.ts` (highest priority, exhaustive conflict matrix)**. _Target ≥ 90%._
2. **Component (P1):** `RecipeDiffViewer`, `IngredientAutocomplete`, `StepEditor` (client-only), `RecipeCard`, **`GlossaryTerm`/`HelpHint`, `TourStep`**. _Target ≥ 70%._
3. **Integration/API (P0/P1):** every endpoint against a disposable MySQL — auth flows, commit snapshot, fork deep-copy, star/fork counter txn, branch compare, **merge atomicity & conflict abort**, authorization matrix (owner/other/anon × public/private). _Target ≥ 80% of handlers._
4. **E2E (P1):** register→verify→login; create→author(ingredients+TipTap)→commit→view diff; fork→branch→edit→open GourMerge Request→merge; star/unstar; explore search; **onboarding (tour shows, skips in one click, persists, re-runs from help menu)**. _Target: all critical journeys green._
5. **i18n gate (P0):** automated DE/EN key-parity + no-empty-values check (P0-010) runs in CI and is itself unit-tested (passes on parity, fails on an injected gap).

**Coverage targets:** overall lines ≥ 75%; diff+merge+units ≥ 90% (release gate). **CI:** lint + typecheck + **i18n bilingual gate** + unit + component + API must pass to merge; E2E on `master`/nightly; coverage thresholds enforced; `npm audit` high = fail.

---

## SECTION 8 — DevOps & Deployment Plan (Netcup Webhosting + Passenger)

> **No Docker in production.** Production is Apache + Phusion Passenger running the built Nitro server, with a separate Netcup MySQL. `docker-compose.yml` stays for **local dev MariaDB only**.

**Build artifact:** Nuxt with Nitro `node-server` preset → `.output/`. **Build happens in CI** (shared hosting can't reliably build); the artifact is shipped to the host.

**Passenger setup:**

- Startup file: `.output/server/index.mjs` (or a thin `app.js` shim) referenced via `.htaccess`: `PassengerAppType node`, `PassengerStartupFile .output/server/index.mjs`, `PassengerAppEnv production`, plus Node version selection per Netcup docs.
- Restart: deploy step `touch tmp/restart.txt`.
- Env vars (`DATABASE_URL`, `NUXT_SESSION_PASSWORD`, `SENTRY_DSN`, SMTP creds): injected via Passenger env directives / Netcup panel — never committed.

**Environment strategy:** `local` (Docker MariaDB) → `staging` (separate Netcup webspace/subdomain + staging DB) → `production`. Same artifact, different injected env.

**CI/CD pipeline (GitHub Actions):**

1. `ci.yml` (all branches): install → lint → typecheck → unit/component/API tests (MySQL service) → build artifact → upload.
2. `deploy.yml` (`master`): download artifact → SFTP/rsync to Netcup → `drizzle-kit migrate` against MySQL (CI secrets) → `touch tmp/restart.txt` → smoke test (`curl https://…/api/health`).

**Health checks:** `/api/health` (DB `SELECT 1`) → polled by **UptimeRobot**; CD smoke test gates the deploy.

**Backup strategy:** Netcup cron `mysqldump` nightly, gzip, retain N days; periodic off-host copy. Verify restore quarterly.

**Monitoring/Logging/Error tracking:** Pino → rotating file (quota-aware); **Sentry.io** client+server with release tags; UptimeRobot uptime alerts.

**Rollback strategy:** keep previous `.output` on the host (`releases/<timestamp>`, symlink `current`); rollback = repoint symlink + `touch tmp/restart.txt`; DB rollback = restore latest dump (forward-only migrations → prefer fix-forward; destructive migrations require a pre-migration dump). Documented in `docs/RUNBOOK.md`.

**Deployment order:** (1) provision MySQL + SSL + env on Netcup → (2) apply baseline migration to prod DB → (3) ship artifact → (4) configure Passenger + restart → (5) smoke test health + login → (6) enable UptimeRobot + confirm Sentry receives events.

---

## SECTION 9 — UX & Product Completion

**Release blockers (v1):**

- Functional recipe editor (ingredients + TipTap steps) with toasts + dirty-guard.
- Ingredient autocomplete with real names (not icon-only).
- Fork / GourMerge Request / merge flows with clear states + conflict view.
- Star toggle, profile, explore/search, tags.
- **Idiot-proof onboarding:** opt-in/skippable/re-runnable tour + concept explainer + guided first recipe + contextual help; cooking-alias terminology with canonical-term tooltips.
- **100% DE+EN coverage of every string** (UI, onboarding, glossary, emails, errors, toasts, SEO, validation) — i18n CI gate green.
- `error.vue` present — verify 404/403/500 coverage.
- Accessibility essentials (keyboard nav, modal focus, ARIA, contrast).
- Mobile responsiveness (sidebar collapse) + dark-mode persistence.
- Empty/loading states (skeletons) on dashboard, explore, history.

**Post-release improvements:**

- Notifications (fork/GourMerge Request events), recipe collections/cookbooks, PDF/print export, automatic metric↔imperial display toggle (engine exists), SSR caching of public recipe pages, richer profile stats, OG image generation.

---

## SECTION 10 — Final Production Readiness Checklist

**Security**

- [ ] Secrets rotated; `.env` untracked; env injected via Passenger/CI
- [ ] CSRF enabled & verified
- [ ] Session rotation post-login; secure/httpOnly/sameSite cookies over HTTPS
- [ ] DB-backed rate limiting on auth + mutations
- [ ] Email verification + password reset live (no user enumeration)
- [ ] Authorization matrix tested (owner/other/anon × public/private)
- [ ] CSP enforced (TipTap/Sentry/fonts allowed); Markdown sanitized
- [ ] Security headers (HSTS, nosniff, referrer, frame-ancestors) present
- [ ] `npm audit` high = 0; Dependabot on

**Infrastructure**

- [ ] Passenger startup file + `.htaccess` + Node version set
- [ ] Let's Encrypt SSL active; HTTP→HTTPS redirect
- [ ] CI green (lint/typecheck/test/build); CD deploys + migrates + restarts
- [ ] Rollback runbook validated; previous artifact retained

**Database**

- [ ] Baseline migration matches live schema; `push` removed from deploy
- [ ] New tables/columns migrated (verification, reset, rate-limit, emailVerifiedAt, public_id)
- [ ] Explore/search + ingredient indexes added
- [ ] Connection pool tuned for shared host; nightly `mysqldump` + restore tested

**API**

- [ ] Zod validation on all endpoints; sanitized errors in prod (no stack leaks)
- [ ] Fork/star txns update counters atomically
- [ ] GourMerge Request merge is transactional; conflicts abort cleanly
- [ ] History via app-side parent walk (no recursive CTE)

**UI**

- [ ] Editor (ingredients + TipTap, no images) commits snapshots
- [ ] Fork/GourMerge Request/merge + conflict view usable
- [ ] Stars/profiles/explore/tags functional; toasts on mutations
- [ ] A11y: keyboard nav, focus traps, ARIA, contrast pass (axe no critical)
- [ ] Responsive on mobile; dark-mode persists
- [ ] No "Pull Request"/PR/`pull_request`/`pullRequest` anywhere (grep clean)

**Onboarding & Localization**

- [ ] Concept explainer + guided first recipe shipped; tour is opt-in, skippable in one click, dismissable, and re-runnable from the help menu
- [ ] Contextual `<HelpHint>` on fork/branch/commit/merge/GourMerge Request; cooking aliases with canonical-term tooltips
- [ ] Onboarding state persisted (`onboardingCompletedAt`) — never re-forced; git-savvy users never blocked
- [ ] i18n bilingual gate green: DE/EN key parity, zero empty values, no hardcoded UI strings
- [ ] Every string DE+EN — UI, onboarding, glossary, emails (verification/reset), error pages, toasts, SEO meta, validation messages
- [ ] Manual DE↔EN switch on every page shows no missing keys

**Testing**

- [ ] Unit ≥90% on units/diff/merge; overall ≥75%
- [ ] Component, API, and E2E golden paths green in CI

**Deployment**

- [ ] PWA icons/favicon in `public/`; manifest installable
- [ ] Smoke test (`/api/health` + login) passes over HTTPS post-deploy

**Monitoring**

- [ ] Pino rotating logs with redaction
- [ ] Sentry.io receiving client+server errors with release tags
- [ ] UptimeRobot polling `/api/health` with alerts

---

## SECTION 11 — Optimal Build Order

Single best sequence to minimize rework, merge conflicts, and schema churn (schema-affecting steps front-loaded so migrations land once):

1. **P0-001** Branch & commit current WIP.
2. **P0-002** Baseline migration; switch `push`→`generate`+`migrate`.
3. **P0-004** Rotate/untrack secrets.
4. **P0-003** Nitro error sanitization.
5. **P0-007** Tune DB pool for shared host.
6. **P0-005 / P0-006 / P0-010** ESLint+Prettier+typecheck; Vitest+Playwright scaffold (+ first `units.ts`/`diff.ts` tests); **i18n bilingual CI gate + no-hardcoded-strings lint** (establish before strings proliferate).
7. **All new tables + columns in one migration wave** (before feature code): `email_verification_tokens`, `password_reset_tokens`, `rate_limit_hits`, `users.emailVerifiedAt`, **`users.onboardingCompletedAt`**, **`recipes.public_id` + `gourmerge_requests.public_id` (UUIDv7 BINARY(16), unique)**, optional merge-provenance columns, explore/ingredient indexes. _(One schema churn, not many.)_ — see **P0-009**.
8. **P1-001→P1-003** Ingredient search/create API + autocomplete.
9. **P1-004→P1-010** Editor rows + TipTap + commit wiring + dirty-guard + toasts + detail rendering + **glossary/terminology foundation** (so all later features use cooking-aliases + tooltips from the start). _(Core loop now works.)_
10. **P2-001→P2-003** CSRF + session rotation + secure cookies.
11. **P2-004** DB-backed rate limiting (table already migrated in step 7).
12. **P2-005 / P2-006 / P2-007** Email verification + password reset + gating.
13. **P3-001 / P3-002** Fork API + UI.
14. **P3-003 / P3-004** Stars API + UI.
15. **P3-005 / P3-006** Profiles + settings.
16. **P3-009** Extend reserved-path middleware (before `/explore`,`/settings` go live).
17. **P3-007 / P3-008** Explore/search + tags.
18. **P3-010** Counter reconcile script.
19. **P4-001** Branch comparison (reuses diff engine).
20. **P4-006** `merge.ts` three-way merge engine **with exhaustive unit tests first** (TDD — highest-risk code).
21. **P4-002→P4-005** GourMerge Request create/list/view/comments/status.
22. **P4-007 / P4-008** Merge execution endpoint + UI/conflict view.
23. **P5-001 / P5-002 / P5-003** Pino + Sentry + UptimeRobot.
24. **P5-004 / P5-005** PWA assets + offline shell.
25. **P5-007 / P5-008** Accessibility + responsive/dark-mode.
26. **P5-006** SEO meta + JSON-LD + sitemap.
27. **P5-009→P5-013** Onboarding: state persistence → concept explainer → interactive tour → guided first recipe + empty states → contextual help. _(Built last, once every flow exists to tour.)_
28. **P5-014** Bilingual content completeness pass — drive the i18n gate to green across all strings (UI, onboarding, glossary, emails, errors, SEO, validation).
29. **P6-001** Security headers / CSP / CORS.
30. **P6-002** Nitro `node-server` preset + Passenger startup config.
31. **P6-003 / P6-004 / P6-005** CI pipeline → CD deploy + migrate + restart → SSL/env.
32. **P6-006** Backup + rollback runbook.
33. **P6-007** Execute Section 10 checklist → **v1 launch.**

---

## Verification (how to prove v1 is done end-to-end)

- **Local:** `npm run lint && npm run typecheck && npm test && npm run build`, then `node .output/server/index.mjs` boots.
- **Core loop E2E (Playwright):** register → verify email → login → create recipe → add ingredients via autocomplete + TipTap steps → commit → view detail + diff vs prior commit.
- **Headline E2E:** second user forks → creates branch → edits → opens GourMerge Request → owner reviews diff + comments → merges → target head advances with combined snapshot; a conflicting edit produces a conflict state, not silent loss.
- **Onboarding E2E:** brand-new account sees the concept intro + tour offer → can skip in one click (git-savvy path) or complete the guided first recipe (novice path) → state persists (not re-forced) → tour re-runs from the help menu.
- **Bilingual:** the i18n gate passes (DE/EN parity, no empty values); manually toggling DE↔EN across every page (incl. onboarding, emails, errors, SEO) shows no missing keys; an intentionally removed DE key fails CI.
- **Security:** automated header/CSP/CSRF assertions + authorization matrix tests; `securityheaders.com` scan on staging.
- **Deploy:** push to `master` → CI green → artifact on Netcup → migrations applied → `tmp/restart.txt` touched → `curl https://…/api/health` returns 200 + DB ok → Sentry receives a test event → UptimeRobot shows up.
- **Naming guardrail:** searching the repo for "pull request" / `pull_request` / `pullRequest` / standalone "PR" returns nothing.
