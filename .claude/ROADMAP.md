# GourMerge — Roadmap

> **What's next.** For what exists today read `.claude/current_state.md` (ground
> truth). For how it looks read `DESIGNBOOK.md`. For architectural rules read
> `.claude/ARCHITECTURE.md`. For ops read `docs/RUNBOOK.md`.
>
> This file used to carry the original pre-v1 production audit — a readiness score,
> a 30-row gap analysis, seven phase plans and a 33-step build order. All of it
> described a codebase that no longer exists: every line item shipped. It was
> deleted rather than annotated, because a roadmap whose bulk is a historical
> record of completed work is a document nobody trusts to tell them what is open.
> Git history has it if provenance is ever needed
> (`git log -- .claude/ROADMAP.md`).

---

## Locked decisions (still binding)

These constrain everything below. They are decisions, not plans — they do not
expire when a phase completes.

1. **Deployment: Netcup Webhosting** (shared) running Node via **Apache + Phusion
   Passenger**, separate MySQL server (**8.4.11**, a Netcup MySQL host). No
   Docker in production — `docker-compose.yml` is local-dev MySQL only. No root,
   no Redis, no self-hosted daemons. Consequences that keep mattering: in-memory
   state is not multi-process safe (hence the DB-backed rate limiter), and the
   host cannot build (hence build-in-CI, ship-the-artifact).
2. **No images, no uploads — text only.** TipTap runs without image nodes.
   Ingredients are identified by real names from the `ingredients` master table;
   icons are decorative.
3. **The full git workflow is not optional.** Fork, branch comparison, GourMerge
   Requests and three-way merge are core product, not add-ons.
4. **Observability: Pino file logging + Sentry.io + UptimeRobot** on
   `/api/health`.
5. **Onboarding stays opt-in.** Offered, easy to reach, never forced. Git terms
   surface as cooking aliases with the canonical term in a tooltip. A git-savvy
   user can skip everything in one click.
6. **Four locales at full parity — a hard gate.** DE (default), EN, FR, IT.
   Every user-facing string, including transactional emails, error pages, toasts,
   SEO meta and validation messages. `npm run i18n:check` fails the build on any
   divergence or empty value. User-generated recipe content stays in the author's
   language.
7. **"GourMerge Request" is the term.** "Pull Request" / PR / `pull_request` /
   `pullRequest` are forbidden everywhere — code, comments, copy, tests. Enforced
   by `npm run design:check`.
8. **Metric-canonical storage.** The DB stores `g`/`ml`/`piece`/`pinch`/`tsp`/
   `tbsp` only. Display conversion happens on the read path.
9. **One place per visual decision.** `app/app.config.ts` or
   `app/assets/css/main.css` — see `DESIGNBOOK.md`. Enforced by
   `npm run design:check`.

### Stack (fixed — do not substitute)

Nuxt 4 · Vue 3 `<script setup lang="ts">` · Nuxt UI v4 (Reka + Tailwind v4) ·
MySQL 8.4 · Drizzle ORM (`mysql2`) · TipTap 3 · `@nuxtjs/i18n` ·
`@vite-pwa/nuxt` · `nuxt-auth-utils` (+ `@simplewebauthn` for passkeys, `otpauth` for
TOTP) · Zod · `diff-match-patch-es`.

---

## Open — owner actions (infrastructure, not code)

Nothing in this section can be closed by a commit. All are documented step by
step in `docs/RUNBOOK.md`.

| Item                                     | Why it is blocking / not                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Let's Encrypt SSL~~                    | **Done.** Wildcard cert (`*.gourmerge.de` + apex), HSTS active, host 301s http→https                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ~~Runtime env injection~~                | **Done.** All 12 variables set as Netcup **Node.js custom environment variables** — not `.htaccess`, which does not exist on this host. `/api/health` reports any that fail to arrive                                                                                                                                                                                                                                                                                                                                                       |
| ~~UptimeRobot monitor on `/api/health`~~ | **Done 2026-08-06.** Public status page at `status.gourmerge.de`, which 301s to `stats.uptimerobot.com`. Two things worth knowing: the redirect is **permanent**, so moving to UptimeRobot’s CNAME-based custom domain later will fight browser caches, and until then the branded subdomain does not survive in the address bar. Still unproven from the earlier session — the Discord contact got the test notification and nothing since, so a real pause/resume test is the only evidence it actually alerts                            |
| Schedule the nightly backup task         | `scripts/server-backup.sh` is installed and verified by hand; the Plesk **"Run a command"** task at 03:15 still needs creating. Plesk's own Backup Manager cannot be used — it demands remote storage and only offers FTP                                                                                                                                                                                                                                                                                                                   |
| Quarterly restore drill                  | **First one passed 2026-08-06** — counts + `CHECKSUM TABLE` identical, JSON valid, utf8mb4 intact. Next due Nov 2026, and before any destructive migration                                                                                                                                                                                                                                                                                                                                                                                  |
| Pin the trusted-proxy hop count          | **Security.** `getRateLimitKey` reads the FIRST `X-Forwarded-For` segment, which the caller controls — so every rate limit (register, login, 2FA, password reset, contact) is bypassable by sending a different value per request. The fix needs one fact from the host: log a real request's XFF, count the hops, then take `length - hops` instead of `[0]`. Guessing is worse than the bug — a wrong index resolves to the proxy's own IP and puts every visitor in one bucket, which breaks registration site-wide after three attempts |

**Note on exposure:** the production MySQL host accepts
connections from arbitrary external IPs on 3306. That is what makes the
runner-based migration step work, and it also means the password is the only
control on the production database. Worth revisiting if Netcup ever offers IP
allow-listing.

---

## Open — deliberately deferred

| Item                                | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Staging environment**             | Only `local` and `production` exist. A third Netcup webspace + DB is the plan; the artifact is already environment-agnostic (same build, different injected env), so this is provisioning, not engineering                                                                                                                                                                                                                                                                                                                                     |
| **Offline navigation (PWA)**        | The service worker caches assets and recipe API responses at runtime, but there is no offline SHELL. `navigateFallback` is explicitly `null` (not just omitted — `@vite-pwa/nuxt` re-defaults an absent key to `'/'`) because it threw `non-precached-url` on every navigation — an SSR app has no `index.html` for `/` to precache, so the fallback could never resolve. Doing it properly means a prerendered `/offline` route registered via `additionalManifestEntries`, pointed at from `navigateFallback`; that is a feature, not config |
| **Dedicated component-mount tests** | The Playwright journeys cover these components functionally. Revisit if a component grows logic that a journey cannot reach cheaply                                                                                                                                                                                                                                                                                                                                                                                                            |
| **TypeScript 7**                    | **Blocked, not deferred.** `@nuxt/ui@4.10.0` declares peer `typescript "^5.6.3 \|\| ^6.0.0"`, so npm refuses 7. Re-check when Nuxt UI widens the range                                                                                                                                                                                                                                                                                                                                                                                         |
| `xlsx` high advisory                | Accepted. Lazy-imported inside the `--from-xlsx` branch of the Swiss-foods importer only, so it is never in the runtime bundle and never loads on the contributor path                                                                                                                                                                                                                                                                                                                                                                         |

---

## Post-v1 backlog

Not scoped, not scheduled. Roughly in the order they would earn their keep.

1. **Notifications** — someone forked your recipe, opened a GourMerge Request,
   commented. The highest-value gap: the collaboration loop currently has no way
   to tell you something happened.
2. **Collections / cookbooks** — group recipes beyond tags.
3. **Print / PDF export** — a kitchen-friendly single page. Cheap given steps are
   already Markdown.
4. **Richer profile stats** — contribution graph, most-forked, activity.
5. **OG image generation** — per-recipe social cards. Note this collides with
   locked decision 2 (no image pipeline); it would need a render-on-demand route,
   not uploads.
6. **SSR caching of public recipe pages** — only once traffic justifies it.
   Measure first: diff and merge are computed on read, and those are the
   expensive paths, not rendering.
7. **Ingredient density table — US cups for dry goods.** Assessed 2026-08-06 and
   parked; the shape of the work is clear, the effort is data entry rather than code.

   What already works: `ml ↔ cup`, `ml ↔ fl oz`, `g ↔ oz`, `tsp`, `tbsp` — the
   factors are in `server/utils/units.ts`, and `/settings` already offers
   Metrisch / Imperial and is honoured on the read path.

   What does not: **`g → cup` for dry ingredients**, because a gram of flour and a
   gram of honey occupy different volumes. That needs one number per ingredient,
   `ingredient_nutrition.density_g_per_ml` — the column **exists** and is populated
   from the Swiss BLV `Dichte` field, but only for **157 of 1194** rows (13 %), and
   `grams_per_piece` is empty everywhere. The engine deliberately refuses rather
   than guessing, which is right: in baking the number is the recipe.

   The cheap version is a curated table of ~50 staples (flour 0.59, sugar 0.85,
   butter 0.91, rice 0.85 …) seeded into the existing column — that covers the
   ingredients anyone actually wants in cups, and everything else keeps showing
   grams. Sources like usa-kulinarisch.de have the conversions.

   Left parked because a partially-converting recipe ("2 cups flour, 340 g
   chicken") may read worse than a consistently metric one, and that is a product
   call, not an implementation detail.

8. **Machine translation of recipe text** (LibreTranslate). Assessed 2026-08-06 and
   deferred rather than rejected — three things have to be settled first, and none
   of them is code:
   - It **contradicts locked decision 6**, which says user-generated recipe content
     stays in the author's language. That decision would need revising, not
     side-stepping.
   - **Self-hosting almost certainly does not fit.** LibreTranslate is Flask +
     Argos Translate; the models are multi-hundred-MB and want ~2–4 GB resident.
     Python being available on the Netcup plan is not the binding constraint —
     memory is, per Passenger worker. Confirm the RAM ceiling before writing
     anything; a small VPS is the realistic home for it.
   - The **public `libretranslate.com` API is not an option as things stand**:
     recipe text would go to a third party, which the privacy policy currently
     rules out ("no third party except Sentry", "die Daten verbleiben in der EU").
     Same blocker that ruled out GitHub Actions for database dumps.

   The cheap, high-value slice if this is ever picked up: translate **ingredient
   names only** — short strings, translated once, cached in `name_translations`
   forever, runnable as an offline script with no runtime service and no change to
   locked decision 6. That is what makes the autocomplete work in all four locales.
   The new-ingredient dialog now collects those names by hand, which covers the same
   gap for anything created from now on.

---

## Reference — decisions worth not re-litigating

Condensed from the original audit. These are the conclusions, not the working.

### Identifiers: INT PK internally, UUIDv7 `public_id` externally

`INT UNSIGNED AUTO_INCREMENT` stays the internal PK and FK target — dense,
sequential, smallest FKs, fastest joins. Externally-referenced entities
(`recipes`, `gourmerge_requests`) additionally carry `public_id BINARY(16)`
holding a UUIDv7, so URLs and API responses never expose an enumerable integer.

UUIDv7 specifically because its leading 48 bits are a Unix-millisecond timestamp:
IDs are time-ordered and append near the right edge of the index, avoiding the
constant page splits and ~2× index bloat that random UUIDv4 causes. Stored as
`BINARY(16)`, not a 36-char string. **Generated in app code** (`uuidv7` package)
— MySQL 8.4 has no `UUID_v7()` at all (that is MariaDB ≥ 11.7), so app-side
generation is the only option, not merely the portable one.

**Auth tokens are CSPRNG, never UUIDv7.** A predictable timestamp prefix would
weaken token unguessability. v7 is for identifiers, not secrets.

### Sign-in factors: a passkey replaces the login, TOTP guards the password

Two opt-in factors, and they are not peers:

- **Passkey → straight in.** No email, no password, no TOTP step. This reads like a
  downgrade and is the opposite: the private key never leaves the authenticator, so
  there is no shared secret to phish or leak, and the origin is bound into the
  assertion, so a lookalike domain gets nothing — which is exactly what TOTP fails at.
  Adding a code after a valid assertion would cost friction and buy nothing.
- **TOTP → second step after a password only.** It exists because passwords are
  phishable and reusable. That reasoning does not transfer to passkeys.

The justification for skipping TOTP rests entirely on _user verification_ — a
biometric or PIN, not mere presence. So `userVerification: 'required'` is requested at
enrolment and at authentication **and** `userVerified` is asserted in our own handlers,
because `nuxt-auth-utils` verifies with a hardcoded `requireUserVerification: false`.
Remove that assertion and the passkey path becomes a password-and-2FA bypass.

Two library traps, both of which shipped as bugs once and are now covered by
`tests/e2e/passkey.spec.ts`:

1. `nuxt-auth-utils` passes its own `authenticatorSelection` object, which **replaces**
   SimpleWebAuthn's default rather than merging — so `residentKey` silently becomes
   "discouraged" and the credential is not discoverable. Usernameless login then cannot
   find a key that enrolled successfully and is visible in settings.
2. Signature-counter checks must tolerate `0`. Synced passkeys (iCloud, Google) always
   report it, because a credential living on several devices cannot keep one monotonic
   counter. Only a decrease from a non-zero value is a clone signal.

**The RP ID is the hostname of the incoming request**, derived by `nuxt-auth-utils` from
`getRequestURL` with nothing overriding it — not an env var. Passkeys are therefore bound
to the exact host they were enrolled on: `gourmerge.de` and `www.gourmerge.de` are
different relying parties, and localhost keys never work in production. If the site ever
answers on more than one hostname, redirect to a canonical one.

### Performance posture on shared MySQL

- **Connection cap:** Passenger runs multiple processes, each with its own pool →
  keep the pool small (3–5) with idle timeouts.
- **History traversal:** walk `parentCommitId` application-side, paginated. Never
  a recursive CTE. (The original rationale — slow MariaDB CTEs — no longer
  applies now that production is confirmed MySQL 8.4, but the app-side walk is
  built, paginated and proven, so it stays.)
- **Diff/merge on read:** fine at v1 scale. This is what to profile first if
  public recipe pages ever get slow.
- **Denormalized counters:** `starCount`/`forkCount` update in the _same_
  transaction as the star/fork row. `scripts/reconcile-counters.mjs` repairs
  drift and is idempotent.
- **Explore:** FULLTEXT `MATCH … AGAINST` for queries ≥ 3 chars, `LIKE` fallback
  below that; paginated; no `SELECT *`.

### Testing posture

Unit tests carry the algorithmic risk — `merge.ts` above all, then `diff.ts`,
`units.ts`, `slug.ts`, the Markdown sanitizer. Playwright carries the
integration risk: the authorization matrix (owner/other/anon × public/private),
and the fork → GourMerge Request → conflict → resolve → merge journey.

Coverage is gated in CI. The number matters less than the rule: **merge and diff
regressions must be caught by a test, not by a user.**

### Why there is no committed SQL dump

It would be a second source of truth for the schema competing with the
migrations, it is unreviewable in a diff, and it bakes in engine and version
specifics. Schema comes from migrations; reference data comes from
`server/database/seeds/swiss-foods.jsonl` (JSON Lines, so a dataset update is a
reviewable diff rather than one rewritten mega-line).

---

## Verification — how to prove the system still works

Run before any release. Every one of these is currently green.

```bash
npm run lint          # eslint + design:check (DESIGNBOOK conformance)
npm run format:check
npm run knip          # dead files / exports / deps
npm run typecheck
npm run i18n:check    # 4-way locale parity, no empty values
npm audit --audit-level=critical
npm test              # unit, with coverage gate
npm run build         # then: node .output/server/index.mjs boots
CI=1 npx playwright test   # API + journey + axe, against the built artifact
```

Beyond the commands:

- **Core loop:** register → verify email → login → create recipe → ingredients
  via autocomplete + TipTap steps → commit → detail page renders → diff against
  the previous commit is correct.
- **Headline flow:** second user forks → branches → edits → opens a GourMerge
  Request → owner reviews the diff and comments → merges → target head advances
  with the combined snapshot. A conflicting edit must produce a conflict state
  with per-conflict resolution, never silent loss. A merged request is immutable.
- **Onboarding:** a brand-new account sees the concept intro and the tour offer,
  can skip in one click, and can re-run the tour from the help menu. State
  persists; nothing is ever re-forced.
- **Sign-in factors:** enrol a passkey in `/settings`, sign out completely, and sign in
  from the login page with **no email and no password**. Separately: enrol TOTP, and
  confirm a password login stops for the code. `tests/e2e/passkey.spec.ts` automates the
  passkey half against a real virtual authenticator — if it is skipped or stubbed, the
  feature is unverified, because both of its historical bugs were invisible above the
  `navigator.credentials` line.
- **Localization:** toggle DE↔EN↔FR↔IT across every page including onboarding,
  emails, error pages and SEO meta — zero missing keys. Deleting one DE key must
  fail CI.
- **Accessibility:** axe reports **zero** critical _and_ zero serious violations
  on every public page, in both colour schemes. A logged-but-ignored "serious" is
  a defect that ships — keep the count at zero.
- **Design conformance:** `npm run design:check` clean. If a rule needs a new
  allow-list entry, change `DESIGNBOOK.md` first.
- **Deploy:** push to `master` → CI green → E2E green for that SHA → `production`
  environment approval → migrations applied from the runner → artifact swapped by
  rename → smoke test passes over HTTPS → auto-rollback if it does not.
