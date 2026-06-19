# GourMerge

> **"Fork the recipe, merge the flavor."**
> _Deutsch: "Wo bester Geschmack verschmilzt."_

A git-like recipe platform. Recipes are repositories — they have branches, commits, forks, and **GourMerge Requests** (our version of "pull requests", a term that is [deliberately absent from this codebase](.claude/ARCHITECTURE.md)).

---

## Tech Stack

| Layer      | Technology                                     |
| ---------- | ---------------------------------------------- |
| Framework  | Nuxt 4 (Vue 3 Composition API)                 |
| UI         | Nuxt UI v4 (Reka UI + Tailwind CSS v4)         |
| Database   | MariaDB via Drizzle ORM (mysql2)               |
| Auth       | nuxt-auth-utils (session-based)                |
| i18n       | @nuxtjs/i18n — DE (default), EN, FR, IT        |
| Editor     | TipTap 3 (Markdown output, no images)          |
| Diff       | diff-match-patch-es                            |
| PWA        | @vite-pwa/nuxt                                 |
| Deployment | Netcup Webhosting + Phusion Passenger (Apache) |

---

## Local Development

### Prerequisites

- Node.js 20+
- Docker (for local MariaDB only — production uses Netcup MySQL)

### Setup

```bash
# 1. Clone
git clone https://github.com/your-org/gourmerge.git && cd gourmerge

# 2. Install dependencies
npm install

# 3. Copy and configure env
cp .env.example .env
# Edit .env — set DATABASE_URL and NUXT_SESSION_PASSWORD at minimum

# 4. Start local MariaDB
docker compose up -d

# 5. Apply migrations
npm run db:migrate

# 6. (Optional) Import Swiss ingredient catalog
npm run seed:swiss

# 7. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Scripts

| Command                  | Description                                     |
| ------------------------ | ----------------------------------------------- |
| `npm run dev`            | Start dev server                                |
| `npm run build`          | Build for production (Nitro node-server)        |
| `npm run typecheck`      | TypeScript type check                           |
| `npm run lint`           | ESLint                                          |
| `npm run lint:fix`       | ESLint auto-fix                                 |
| `npm run format`         | Prettier format                                 |
| `npm test`               | Vitest unit + component tests                   |
| `npm run test:e2e`       | Playwright E2E tests                            |
| `npm run i18n:check`     | 4-way locale parity gate (DE/EN/FR/IT)          |
| `npm run db:generate`    | Generate a new Drizzle migration                |
| `npm run db:migrate`     | Apply pending migrations                        |
| `npm run db:studio`      | Drizzle Studio (visual DB explorer)             |
| `npm run seed:swiss`     | Import Swiss BLV Food Composition Database V7.0 |
| `npm run generate:icons` | Regenerate PWA/favicon assets from brand SVG    |

> **Never run `npm run db:push` against production.** It mutates the DB directly without a migration file.

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

## Maintenance Scripts

```bash
# Recompute denormalized star/fork counters (run if counters drift):
node scripts/reconcile-counters.mjs

# Remove test ingredients with no Swiss BLV data not used in any recipe:
node scripts/cleanup-seed-ingredients.mjs           # dry-run
node scripts/cleanup-seed-ingredients.mjs --execute # apply
```

---

## Project Status

See [`.claude/current_state.md`](.claude/current_state.md) — full feature implementation status, API inventory, DB schema summary, and known quirks.

See [`.claude/ROADMAP.md`](.claude/ROADMAP.md) — v1 delivery plan and remaining work.
