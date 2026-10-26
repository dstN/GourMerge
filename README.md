# GourMerge

> **"Fork the recipe, merge the flavor."**
> _Deutsch: "Wo bester Geschmack verschmilzt."_

A git-like recipe platform. Recipes are repositories — they have branches, commits, forks, and **GourMerge Requests** (our version of "pull requests", a term that is [deliberately absent from this codebase](.claude/ARCHITECTURE.md)).

---

## Tech Stack

| Layer      | Technology                                      |
| ---------- | ----------------------------------------------- |
| Framework  | Nuxt 4.5 · Vite 8 · Vue 3.5 (Composition API)   |
| Language   | TypeScript 6                                    |
| UI         | Nuxt UI v4 (Reka UI + Tailwind CSS v4)          |
| Database   | MySQL 8.4 via Drizzle ORM (mysql2)              |
| Validation | Zod 4                                           |
| Auth       | nuxt-auth-utils, session, opt-in TOTP, passkeys |
| i18n       | @nuxtjs/i18n 10, DE (default), EN, FR, IT       |
| Editor     | TipTap 3 (Markdown output, no images)           |
| Diff       | diff-match-patch-es 2                           |
| PWA        | @vite-pwa/nuxt                                  |
| Runtime    | Node 26                                         |
| Deployment | Netcup Webhosting + Phusion Passenger (Apache)  |

At a glance: **29 pages · 69 API endpoints · 30 tables · 714 i18n keys × 4
locales · 304 unit tests · 88 Playwright specs · zero axe
violations · `npm audit` at zero.**

Fonts and icons are self-hosted — no Google Fonts, no Iconify API at runtime, so
no visitor IP reaches a third party. See [CHANGELOG.md](CHANGELOG.md) for the
full v1.0.0 scope.

---

## Local Development

### Prerequisites

- **Node.js 26** (matches CI and the production host)
- **MySQL 8.4**: a native install, or the optional `docker-compose.yml`. Match
  production's major version, and **do not use MariaDB**: the app issues
  MySQL-specific JSON and FULLTEXT SQL that behaves differently there.

Docker is entirely optional and used nowhere else in this project — not in CI, not
in production. If you already have MySQL, skip it.

### Setup

```bash
# 1. Clone + install
git clone https://github.com/your-org/gourmerge.git && cd gourmerge
npm install

# 2. Configure env
cp .env.example .env
# Set DATABASE_URL and NUXT_SESSION_PASSWORD at minimum.
# Generate a session password:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Get a database — EITHER
#    (a) use your native MySQL 8.4 on :3306, create the db + user, or
#    (b) start the bundled container (published on :3307 so it can coexist
#        with a native MySQL — use the 3307 URL from .env.example):
docker compose up -d

# 4. Schema + all seed data, one command (idempotent — safe to re-run)
npm run db:setup

# 5. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### What `db:setup` does

It runs migrations, then every seed, then the search-term build, because an empty database gives you an
app you cannot really use — with no ingredients, the autocomplete returns nothing
and you cannot author a recipe, which is the core loop.

| Step             | Provides                                                                                |
| ---------------- | --------------------------------------------------------------------------------------- |
| `db:migrate`     | Schema, 18 versioned migrations                                                         |
| `seed:swiss`     | 1190 foods + per-100g nutrition, DE/EN/FR/IT names, from the committed seed file        |
| `db:seed`        | Curated ingredients absent from the Swiss dataset (e.g. Vanillezucker)                  |
| `db:seed:tags`   | Base culinary tags                                                                      |
| `db:seed:tour`   | The onboarding tour's system recipe                                                     |
| `search:rebuild` | `ingredient_search_terms`, what the autocomplete matches on, derived from all the above |

The Swiss data is read from `server/database/seeds/swiss-foods.jsonl`, which **is**
committed — so seeding needs no spreadsheets, no downloads and no `xlsx`
dependency. See [Swiss ingredient data](#swiss-ingredient-data) for regenerating it.

---

## Scripts

| Command                    | Description                                           |
| -------------------------- | ----------------------------------------------------- |
| `npm run dev`              | Start dev server                                      |
| `npm run build`            | Build for production (Nitro node-server)              |
| `npm run typecheck`        | TypeScript type check                                 |
| `npm run lint`             | ESLint + design-system gate                           |
| `npm run lint:fix`         | ESLint auto-fix                                       |
| `npm run design:check`     | DESIGNBOOK.md conformance gate                        |
| `npm run format`           | Prettier format                                       |
| `npm test`                 | Vitest unit tests (coverage-gated)                    |
| `npm run test:e2e`         | Playwright API + journey + axe a11y tests             |
| `npm run knip`             | Dead-code check (unused files/exports/deps)           |
| `npm run i18n:check`       | 4-way locale parity gate (DE/EN/FR/IT)                |
| `npm run db:generate`      | Generate a new Drizzle migration                      |
| `npm run db:migrate`       | Apply pending migrations                              |
| `npm run db:setup`         | Migrate + all seeds (first-run convenience)           |
| `npm run db:cleanup`       | Retention windows, locally (production: /tasks/*)     |
| `npm run db:inactive`      | Same, locally (production uses /tasks/*, see runbook) |
| `npm run db:studio`        | Drizzle Studio (visual DB explorer)                   |
| `npm run seed:swiss`       | Load the committed Swiss BLV seed file into the DB    |
| `npm run seed:swiss:regen` | Regenerate that seed file from the BLV spreadsheets   |
| `npm run seed:bls`         | Load the committed BLS 4.0 seed file into the DB      |
| `npm run seed:bls:regen`   | Regenerate that seed from the MRI spreadsheet + map   |
| `npm run search:rebuild`   | Rebuild the ingredient search terms from the catalog  |
| `npm run db:seed`          | Curated ingredients not in the Swiss dataset          |
| `npm run db:seed:tags`     | Base culinary tags                                    |
| `npm run generate:icons`   | Regenerate PWA/favicon assets from brand SVG          |

> **Never run `npm run db:push` against production.** It mutates the DB directly without a migration file.

---

## Ingredient data

Ingredients and their per-100g nutrition come from two public datasets: the **Swiss BLV
Food Composition Database V7.0** ([naehrwertdaten.ch](https://www.naehrwertdaten.ch),
1190 foods, DE/EN/FR/IT) and the German **Bundeslebensmittelschlüssel BLS 4.0** of the
Max Rubner-Institut ([blsdb.de](https://blsdb.de), 5325 foods imported, DE/EN; FR/IT
names are ours). Where both describe the same food (442 cases, decided by hand in
`server/database/seeds/bls-map.csv`) there is one ingredient with two
`ingredient_sources` rows: it shows the German BLS name, keeps the Swiss nutrition
values and FR/IT names, and answers to both names in the search. Everything else is
its own ingredient, so the catalog holds about 6100 reference ingredients.

### Swiss BLV

`server/database/seeds/swiss-foods.jsonl` (1190 foods, ~1 MB) is **committed**, so
`npm run seed:swiss` works on a fresh clone with no downloads and no `xlsx`
dependency. It is JSON Lines — one food per line — so updating the dataset produces
a reviewable diff rather than rewriting a single enormous line.

We deliberately do **not** commit a SQL dump. A dump would become a second source of
truth for the schema alongside the migrations and drift from them, it is not
reviewable in a diff, and it bakes in engine and version specifics. Schema comes from
migrations; reference data comes from this seed file.

To regenerate after BLV publishes a new revision:

```bash
# 1. Download all four language exports into .claude/data/swiss/
#      Schweizer_Nahrwertdatenbank.xlsx                    (de — required)
#      Swiss_food_composition_database.xlsx                (en)
#      Base_de_donnees_suisse_des_valeurs_nutritives.xlsx  (fr)
#      Banca_dati_svizzera_dei_valori_nutritivi.xlsx       (it)
# 2. Rebuild the seed file (needs the `xlsx` devDependency; no DB access)
npm run seed:swiss:regen
# 3. Review the diff, then load it
npm run seed:swiss
```

The spreadsheets themselves are **not** in the repo — `.claude/` is gitignored, which
also sidesteps any question about redistributing them. Only the derived seed is
tracked.

### BLS 4.0

`server/database/seeds/bls-foods.jsonl` (~4 MB, committed) is built from the MRI's
spreadsheet plus three hand-maintained files next to it: `bls-map.csv` (which codes are
the same ingredient as a Swiss food, which dish-group codes are ingredients after all —
stocks, sauces, doughs — and which are skipped), `bls-i18n.jsonl` (FR/IT names for
every imported code) and `bls-4.0-errata.json` (the MRI's published corrections, applied
on the way in; the OLSAC energy double count is a rule in `scripts/lib/bls.mjs`).
`npm run seed:bls` runs after `seed:swiss`, because the pairs attach to Swiss rows.

To regenerate after the MRI publishes 4.1:

```bash
# 1. Download the German ZIP from https://blsdb.de/bls (the English one is the same
#    data with English headers) and put BLS_4_0_Daten_2025_DE.xlsx into .claude/data/bls/
# 2. Add FR/IT names for new codes to bls-i18n.jsonl, decisions for new codes to
#    bls-map.csv, bump DATASET_VERSION in scripts/lib/bls.mjs
# 3. Rebuild the seed — it refuses to write when a decision or a translation is missing
npm run seed:bls:regen
# 4. Review the diff, then load it
npm run seed:bls
```

---

## Database Migrations

Migrations live in [server/database/migrations/](server/database/migrations/).

```bash
# After changing server/database/schema.ts:
npm run db:generate -- --name=describe-your-change
npm run db:migrate
```

In CI/CD, `db:migrate` runs automatically before Passenger restart.

---

## i18n

All UI strings are translated into 4 locales: **DE** (default), **EN**, **FR**, **IT**.

- Locale files: `i18n/locales/{de,en,fr,it}.json`
- CI gate: `npm run i18n:check` — fails on any missing key or empty value across all 4 locales
- Strategy: `prefix_except_default` — German has no path prefix; others use `/en/`, `/fr/`, `/it/`
- User-generated recipe content is NOT translated (stays in author's language)

---

## Architecture

See [`.claude/ARCHITECTURE.md`](.claude/ARCHITECTURE.md) — rules for naming conventions, DB design, API patterns, and coding standards.

Key rules (never violate):

- "Pull Request" is **forbidden**. Use **GourMerge Request** / `gourmerge_request` / `gourmergeRequest`.
- `<script setup lang="ts">` everywhere. Options API is forbidden.
- DB stores metric units only (`g`, `ml`). Display conversion in `server/utils/units.ts`.
- Commits are **full snapshots** (not deltas). Diffs computed on-read.
- No recursive CTEs — traverse `parentCommitId` app-side.
- Never use `window.confirm` — use `UModal` for async confirmations.

---

## Production Deployment (Netcup + Passenger)

Production is **not Docker**. `docker-compose.yml` is local dev only.

1. CI builds the artifact (`npm run build` → `.output/`)
2. CI SFTPs `.output/` to Netcup webspace
3. CI runs `drizzle-kit migrate` against the production MySQL
4. `touch tmp/restart.txt` signals Passenger to restart

Environment variables are injected via Passenger env directives — never committed. See `.env.example`.

Full runbook: [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

---

## Observability

- **Logs**: Pino → rotating `logs/app.log` (redacts cookies/passwords) in production; pino-pretty in dev
- **Errors**: Sentry.io client + server (`@sentry/nuxt`); set `NUXT_PUBLIC_SENTRY_DSN` in env
- **Health**: `GET /api/health` → `{ status, db }` — monitored by UptimeRobot

---

## Privacy (GDPR)

Users handle both of their main rights themselves at `/legal/data-request`, with
no support ticket in the loop:

| Right                   | Flow                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| **Access** (Art. 15/20) | username + email → confirmation email → download link, valid 24 h, also emailed                       |
| **Erasure** (Art. 17)   | username + email → confirmation email → choose whether recipes are deleted too → account hard-deleted |

Two design points worth knowing before touching this code:

- **Ownership is proven by the inbox, not by a session.** Someone locked out of
  their account still holds both rights, so neither flow requires a login.
- **Erasure is a real `DELETE` of the user row, not an anonymise-in-place.** Four
  foreign keys into `users` are `NOT NULL` and `RESTRICT`, and a fork copies
  commits keeping the original `author_id` — so a bare delete would either fail
  on the constraint or destroy another user's recipe history. A shared tombstone
  `ghost` account inherits that orphaned attribution first, GitHub's pattern
  applied per user; the departing user's own content is deleted outright, only
  their fingerprints inside other people's forks and threads survive, reading as
  the anonymous ghost.

Exports are built per request and streamed; nothing is written to disk.

## Maintenance Scripts

```bash
# Enforce the retention windows stated in the privacy policy.
# Runs nightly in production — see docs/RUNBOOK.md.
npm run db:cleanup
node scripts/cleanup-retention.mjs --dry-run  # preview, deletes nothing

# Recompute denormalized star/fork counters (run if counters drift):
node scripts/reconcile-counters.mjs

# Remove test ingredients with no Swiss BLV data not used in any recipe:
node scripts/cleanup-seed-ingredients.mjs           # dry-run
node scripts/cleanup-seed-ingredients.mjs --execute # apply
```

---

## Project Status

See [`.claude/current_state.md`](.claude/current_state.md) — full feature implementation status, API inventory, DB schema summary, and known quirks.

See [`.claude/ROADMAP.md`](.claude/ROADMAP.md) — what is still open (owner/infra actions, deliberate deferrals) and the post-v1 backlog.

See [`DESIGNBOOK.md`](DESIGNBOOK.md) — the design system: how the UI looks, where a visual decision is allowed to live, and what `npm run design:check` enforces. **Read this before changing anything visual.**
