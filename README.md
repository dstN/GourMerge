# GourMerge

> **"Fork the recipe, merge the flavor."**
> _Deutsch: "Wo bester Geschmack verschmilzt."_

A git-like recipe platform. Recipes are repositories — they have branches, commits, forks, and **GourMerge Requests** (our version of "pull requests", a term that is [deliberately absent from this codebase](/.claude/ARCHITECTURE.md)).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Nuxt 4 (Vue 3 Composition API) |
| UI | Nuxt UI v4 (Reka UI + Tailwind CSS v4) |
| Database | MariaDB via Drizzle ORM (mysql2) |
| Auth | nuxt-auth-utils (session-based) |
| i18n | @nuxtjs/i18n (DE default, EN via `/en/`) |
| Editor | TipTap 3 (Markdown output, no images) |
| Diff | diff-match-patch-es |
| PWA | @vite-pwa/nuxt |
| Deployment | Netcup Webhosting + Phusion Passenger (Apache) |

---

## Local Development

### Prerequisites
- Node.js 20+
- Docker (for local MariaDB only)

### Setup

```bash
# 1. Clone
git clone https://github.com/your-org/gourmerge.git && cd gourmerge

# 2. Install dependencies
npm install

# 3. Copy and edit env
cp .env.example .env
# Edit .env — set DATABASE_URL and NUXT_SESSION_PASSWORD at minimum

# 4. Start local MariaDB
docker compose up -d

# 5. Apply migrations
npm run db:migrate

# 6. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Build for production (Nitro node-server) |
| `npm run typecheck` | TypeScript type check |
| `npm run lint` | ESLint |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run format` | Prettier format |
| `npm test` | Vitest unit + component tests |
| `npm run test:e2e` | Playwright E2E tests |
| `npm run i18n:check` | Bilingual DE/EN parity gate |
| `npm run db:generate` | Generate a new Drizzle migration |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Drizzle Studio (visual DB explorer) |

> **Never run `npm run db:push` against production.** It mutates the DB directly without a migration file.

---

## Database Migrations

Migrations live in [server/database/migrations/](server/database/migrations/).

```bash
# After changing server/database/schema.ts:
npm run db:generate -- --name=describe-your-change
npm run db:migrate
```

In CI/CD, `db:migrate` runs automatically before restart.

---

## Production Deployment (Netcup + Passenger)

1. CI builds the artifact (`npm run build` → `.output/`)
2. CI SFTPs `.output/` to Netcup webspace
3. CI runs `drizzle-kit migrate` against the production MySQL
4. `touch tmp/restart.txt` signals Passenger to restart

Environment variables are injected via Passenger env directives — never committed. See `.env.example`.

Full runbook: `docs/RUNBOOK.md` (created in Phase 6).

---

## Architecture

See [`.claude/ARCHITECTURE.md`](.claude/ARCHITECTURE.md) — the single source of truth for all naming conventions, DB rules, API design, and coding standards.

Key rules:
- "Pull Request" is **forbidden**. Use **GourMerge Request** / `gourmerge_request` / `gourmergeRequest`.
- `<script setup lang="ts">` everywhere. Options API is forbidden.
- DB stores metric units only (`g`, `ml`). Display conversion in `server/utils/units.ts`.
- Commits are **full snapshots** (not deltas). Diffs computed on-read.
- No recursive CTEs — traverse `parentCommitId` app-side.

---

## Project Status

See [`.claude/ROADMAP.md`](.claude/ROADMAP.md) for the full v1 implementation plan.
