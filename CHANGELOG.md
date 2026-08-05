# Changelog

All notable changes to GourMerge are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-08-05

First production release. Everything below is the initial feature set rather
than a diff against a predecessor, so it is grouped by area instead of by
added/changed/fixed.

### The product

- **Git-like recipe model** — recipes are repositories with branches, snapshot
  commits (full snapshots, never deltas), on-read diffs, and forks. Forking
  replays the source branch's entire commit chain, preserving `parentCommitId`
  lineage and the original author attribution.
- **GourMerge Requests** — the full propose/review/merge lifecycle across
  branches and forks: create, list, diff view, Markdown comments, status
  transitions, and a three-way snapshot merge with conflict detection and
  interactive per-conflict resolution. The merge runs in one transaction behind
  a `SELECT … FOR UPDATE` guard so two concurrent merges cannot both win.
- **Editor** — TipTap 3 WYSIWYG (no images), per-step translations for all four
  locales, Markdown output, ingredient rows with autocomplete, and a dirty-state
  navigation guard.
- **Ingredients & nutrition** — 1191 foods from the Swiss BLV Food Composition
  Database V7.0 with DE/EN/FR/IT names and synonyms, plus per-100 g nutrition and
  a per-serving/total facts panel.
- **Social** — stars, forks, tags, public profiles, and an explore page with
  FULLTEXT search, filtering and sorting.
- **Onboarding** — an opt-in, skippable, re-runnable tour, a concept explainer, a
  guided first recipe, contextual help, and a glossary that presents git terms as
  cooking aliases.
- **27 pages · 37 API endpoints · 18 tables · 8 migrations.**

### Privacy and legal

- **GDPR self-service** — data export (Art. 15/20) and account erasure (Art. 17),
  both driven by an emailed confirmation rather than a session, so a locked-out
  user can still exercise either right. Exports are generated per request and
  streamed, never written to disk. Erasure anonymises the user row in place and
  lets the user choose whether their recipes go with it.
- **Retention enforcement** — `npm run db:cleanup` applies the windows the
  privacy policy states. Before it, `contact_messages` and `rate_limit_hits` had
  no delete path at all.
- **Imprint and privacy policy** in all four locales, describing what the code
  actually does — including that fonts and icons are self-hosted and that Sentry
  runs in the EU region with PII stripped.
- **Self-hosted assets** — no Google Fonts and no Iconify API at runtime, so no
  visitor IP reaches a third party.

### Security

Session auth with CSRF, post-login session rotation, DB-backed rate limiting
(multi-process safe under Passenger), email verification, password reset without
user enumeration, Zod validation on every endpoint, ownership checks on every
mutating route, sanitised Markdown, a nonce-based CSP that drops `unsafe-inline`
from `script-src` in production, HSTS, and `npm audit` at zero.

### Internationalisation

Four locales at full parity — DE (default), EN, FR, IT — covering UI, onboarding,
glossary, legal texts, validation and transactional emails. **455 keys**, gated in
CI; emails are localised from the recipient's stored preference.

### Operations

- Pino logging with rotation (10 MB / daily / 7 files), Sentry on client and
  server, `/api/health`.
- CI: lint → format → knip → typecheck → i18n → audit → migrate → test → build.
  **132 unit tests at 93.8 % line coverage**, plus 5 Playwright spec files
  covering API, journeys and axe.
- CD to Netcup: gated on the E2E run for the same commit, migrates before
  swapping, streams the artifact as a tar over SSH (the chroot has neither
  `rsync` nor `gzip`), activates by atomic rename, retains the previous release,
  and auto-rolls back if the smoke test fails.

### Stack

Nuxt 4.5.1 · Vite 8.2.0 · Vue 3.5.40 · TypeScript 6.0.3 · Nuxt UI 4.10 ·
MySQL 8.4 via Drizzle ORM 0.45 · Zod 4.4 · @nuxtjs/i18n 10.6 · Node 26.

TypeScript 7 is held back by `@nuxt/ui@4.10.0`, whose peer range is
`^5.6.3 || ^6.0.0`.

---

<!-- Release links are added once the repository is published. -->
