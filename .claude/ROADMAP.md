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

> **Decision 2 was revised on 2026-08-09** (owner request). It used to read "No
> images, no uploads — text only." Recipes now carry exactly one uploaded photo.
> The revised wording is below; the reasoning for the storage choice is in
> §"Images, and why the bytes live in MySQL".

1. **Deployment: Netcup Webhosting** (shared) running Node via **Apache + Phusion
   Passenger**, separate MySQL server (**8.4.11**, a Netcup MySQL host). No
   Docker in production — `docker-compose.yml` is local-dev MySQL only. No root,
   no Redis, no self-hosted daemons. Consequences that keep mattering: in-memory
   state is not multi-process safe (hence the DB-backed rate limiter), and the
   host cannot build (hence build-in-CI, ship-the-artifact).
2. **One uploaded image per recipe, plus one profile picture — no other
   uploads.** _(Revised 2026-08-09; previously "no images, no uploads — text
   only".)_ A recipe may carry a single serving-suggestion photo, stored in
   `recipe_images` and served from `/api/recipes/:id/image`. A user may carry a
   single profile picture, stored in `user_avatars` and served from
   `/api/users/:username/avatar-image`, cropped to 1:1 in the browser before
   upload. Everything else stays text: TipTap still runs without image nodes, so
   **step content cannot contain an image**, and there is no general upload
   surface. Ingredients are identified by real names from the `ingredients`
   master table; icons are decorative. A user with no uploaded picture still
   gets the generated identicon-QR badge.
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

## Audit — 2026-08-09

A feature pass (discussions, recipe photo, navigation rework, identicon-QR
avatars) plus a full read of the repository against `ARCHITECTURE.md`,
`DESIGNBOOK.md`, the Lighthouse report and a white-hat sweep of every endpoint.
**Fixed in this pass** is recorded so the same ground is not re-covered; **still
open** is the actual backlog this section adds.

> **Reconciled 2026-08-14.** Four rows below were still marked open even though
> the fix shipped the same day as this audit, in commit `13f2ea8` (rate-limit
> sweep, LIKE escaping, `simulate-activity` gate, dashboard sidebar restore) —
> the audit text was written before that commit landed and was never revisited.
> `CHANGELOG.md` `[1.7.0]` and `current_state.md` already had it right; only
> this file's own tables were stale. Struck through below, same convention as
> the ingredients row.

### Fixed — security

| #   | Severity     | What                                                                                                                                                                                                                                                                                                                                                                                                | Where                                           |
| --- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | **Critical** | `GET /api/recipes/:id/diff` had **no** visibility check **and** never scoped `?from=`/`?to=` to the recipe in the path. `/api/recipes/<any public id>/diff?from=1&to=2` returned the ingredients and steps of commits 1 and 2 from _whatever recipe they belonged to_, with no session. Recipe and commit ids are sequential integers, so walking them dumped every private recipe in the database. | `server/api/recipes/[id]/diff.get.ts`           |
| 2   | High         | `GET /api/recipes/:id/commits` had no visibility check — a private recipe's entire history (commit messages, author names, timestamps) answered to anyone.                                                                                                                                                                                                                                          | `server/api/recipes/[id]/commits/index.get.ts`  |
| 3   | Medium       | `GET /api/recipes/:id/branches` had no visibility check — leaked private recipes' branch names.                                                                                                                                                                                                                                                                                                     | `server/api/recipes/[id]/branches/index.get.ts` |

All three now go through `requireVisibleRecipe()` / `requireCommitInRecipe()`
(`server/utils/recipeAccess.ts`), which is the substantive fix: **twelve of the
fifteen recipe `GET`s had a hand-written copy of the rule and three did not**, and
nothing in the codebase could tell you which. One implementation, one place to
audit. `tests/e2e/api/private-recipe-leaks.spec.ts` pins all three shut and
asserts 404-not-403 (a 403 confirms the id exists, which on sequential integers is
itself the disclosure).

### Fixed — robustness, a11y, design

- **An early rejection poisoned the _next_ request on the connection.** Any guard
  that answers before the body is read — `requireUserSession`, an ownership check,
  the new upload size cap — leaves unread bytes on the socket; Node then destroys
  it and the client's next keep-alive request dies with `ECONNRESET` rather than
  getting an answer. Reproduced against an existing endpoint (a 4 MB `POST
/api/recipes` rejected 401 broke the following `/auth/register`), so this
  predates the new code. `server/plugins/error-handler.ts` now sends
  `Connection: close` on an error whose request body was not consumed — RFC 9110
  §6.1 — guarded on `readableEnded` so ordinary 4xx keep their connection.
- **Nine `variant="subtle"` badges failed AA in light mode** (`success` measures
  **2.03:1** on its own wash) across `RecipeDiffViewer`, `NutritionFacts` and the
  new discussion panel. DESIGNBOOK §1.6 claimed this was "solved centrally", but
  the `.tint-*` classes only work where a call site applies one. Fixed, and made
  mechanical: **`design:check` rule 14** now fails on a semantic subtle badge with
  no tint. That rule is how the other eight were found.
- **The axe sweep never visited a recipe page** — the highest-traffic page in the
  app, and the one carrying user-generated content. Added, in both colour schemes,
  with a discussion thread rendered. It is what surfaced the contrast defects
  above.

### Still open — security

| Item                                                                               | Why it matters                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ~~Rate-limit the content-creating endpoints~~                                      | **Fixed 2026-08-09**, same pass as the ingredients row below. All 21 previously-unlimited mutating endpoints — `fork`, `star`, tag-setting, branch/commit creation, every GMR mutation, every discussion mutation, recipe-photo delete, avatar delete, profile update, ingredient creation — now carry `useRateLimit()`, keyed **per user** (not IP, so an account can't spread across addresses to dodge it), sized to the action. See CHANGELOG `[1.7.0]` "Security — 21 mutating endpoints had no rate limit at all".                                           |
| ~~`POST /api/ingredients` writes to the global master catalog~~                    | **Fixed.** All three concerns from this row are now closed: `created_by` + a per-user rate limit shipped later the same day (see current_state.md §12, "Rate limiting swept..."), and `DELETE /api/ingredients/:id` (2026-08-12) lets the creator remove a row outright rather than soft-delete — blocked with a `409 ingredient_in_use` the moment any commit has ever referenced it, so an in-use row can't be pulled out from under a recipe. `scripts/cleanup-seed-ingredients.mjs` still exists as the after-the-fact sweep for anything created before this. |
| **Pin the trusted-proxy hop count**                                                | Still open — see the matching row in "Open — owner actions" below. It is what makes every limit above bypassable even once they exist.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ~~`LIKE` wildcards are not escaped~~ in ingredient search and the explore fallback | **Fixed 2026-08-09.** `server/utils/likeEscape.ts`'s `escapeLikePattern()` is applied at every `LIKE` call site — ingredient autocomplete, tags, and Explore's short-query fallback and tag filter. See CHANGELOG `[1.7.0]` "Fixed — a `%` in a search box matched everything".                                                                                                                                                                                                                                                                                    |
| ~~`POST /api/recipes/:id/simulate-activity` ships to production~~                  | **Fixed 2026-08-09** — gated structurally rather than behind a client flag: rate-limited (5/hour) and refused unless the target branch has exactly one commit, a state only a just-created recipe is in. See CHANGELOG `[1.7.0]` "Fixed — the tour's own demo endpoint had no gate beyond 'is this your recipe'".                                                                                                                                                                                                                                                  |

### Still open — correctness and CI

| Item                                                                | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local dev runs MySQL 8.0.45, not 8.4**                            | `docker-compose.yml`, CI and E2E are pinned to `mysql:8.4` and production is 8.4.11, but the developer machine this audit ran on answers `8.0.45`. That is exactly the split the engine correction in `ARCHITECTURE.md` §2 was written to end. It is not, on closer look, why `tests/e2e/api/ingredients.spec.ts` ("the new ingredient must be searchable by translation") flakes locally: a single fresh row was findable by its translation via a direct manual request, and `information_schema` showed 18 rows already sitting in the local `ingredients` table with the literal English translation the test always searched for (`nameTranslations.en: 'Spec ingredient'`, never suffixed unlike `name`) — `GET /api/ingredients` has no `ORDER BY` and a default `limit=10`, so the newest match can fall off the page once enough same-text rows accumulate from repeat local runs. Fixed the test to suffix the translation too, matching `name`. Point local dev at the compose file anyway — the version split itself is real even though it wasn't this bug's cause. Owner action — nothing here can fix a developer's own MySQL install.                                                                         |
| ~~The dashboard sidebar's "recently edited" list was dropped~~      | **Fixed 2026-08-09.** It was the one thing in the removed `<aside>` that had no duplicate elsewhere. Restored on the dashboard page itself — see CHANGELOG `[1.7.0]` "Added — the dashboard's 'recently edited' list, restored".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **A MySQL-vs-Node clock skew, found while building the item above** | Building a relative-time display ("2 hours ago") surfaced `recipes.updated_at` reading ahead of `Date.now()` by what looked like a full timezone offset on this local dev box — a fresh recipe's own `CURRENT_TIMESTAMP` read as 2 hours in the future the instant it was created. `SELECT @@global.time_zone, @@session.time_zone` both answered `SYSTEM`, and in the same process `NOW()` vs `UTC_TIMESTAMP()` disagreed with each other in a way that points at the mysql2 driver's local-timezone assumption compounding with however this MySQL install's `SYSTEM` zone resolves — but that is inference, not proof, and it was not chased further: fixing a timezone conversion on a guess is worse than the bug. The dashboard label is clamped so it can never _display_ a future time regardless of which direction a real skew runs, which is safe unconditionally. What is still open is the actual cause — check whether it reproduces against the `docker-compose.yml` MySQL (the row above already flags local dev as unpinned) and against production before touching any timezone setting: a wrong fix here would quietly shift every `createdAt`/`updatedAt`, rate-limit window and token expiry in the app. |

~~`npm run knip` fails today, so CI is red~~ — **Fixed.** `scripts/seed-tour-recipe.mjs`'s
`dotenv/config` import was the cause; removed in favor of Node's built-in
`--env-file-if-exists`, which every sibling script already relied on through the caller's
environment anyway.

~~`tests/e2e/tour.spec.ts` asserts anchors that no longer exist~~ — **Fixed.** Rewritten
against the current `BASE_TOUR` step list (`add-ingredient` → `add-step` → `commit-button` →
`view-recipe-btn`; history/GMR/fork are sub-tours triggered on arrival, not chained "Weiter"
clicks). Fixing it surfaced a real bug it had been masking: the tour's own demo
ingredient/step made the edit page's `isDirty` true from the moment it typed them in, so
clicking "View recipe" — the button the tour highlights next — raised an unrelated
unsaved-changes prompt. See the CHANGELOG.

### Lighthouse (mobile, `lighthouse.json`, 2026-08-08)

**Performance 99 · Accessibility 100 · Best Practices 100 · SEO 100.** The one
missing point is arithmetic, not a defect:

| Metric      | Value  | Score | Weight |
| ----------- | ------ | ----- | ------ |
| FCP         | 1.6 s  | 0.95  | 10     |
| LCP         | 1.8 s  | 0.99  | 25     |
| TBT         | 100 ms | 0.98  | 30     |
| CLS         | 0.003  | 1.00  | 25     |
| Speed Index | 1.6 s  | 1.00  | 10     |

That sums to **98.65**, which rounds to 99; 100 needs ≥ 99.5, i.e. ~0.85 points
across FCP, LCP and TBT together. Fixing FCP _and_ LCP outright yields 0.75 — so
no single change gets there.

What the report flags, and what each one is actually worth:

- **`render-blocking-insight`, est. 300 ms** — `entry.css`, the only blocking
  request. Measured on the current build: **237,678 B raw, 31,803 B gzip, 25,148 B
  brotli**, against a ~12 KB document. Inlining it removes one round trip and
  roughly triples the HTML on every request, and because the host serves
  `/_nuxt/*` with **no cache headers at all** (see `cache-insight` below) there is
  no repeat-visit cache to lose either. That makes it close to break-even on the
  simulated profile rather than the clear win the audit's "savings" model implies,
  and it cannot be verified without a production Lighthouse run. **Deliberately
  not done.** If it is attempted, the honest way is real critical-CSS extraction
  (`beasties`) at build time, and the acceptance test is a before/after run
  against production — not the lab estimate.
- **`cache-insight`, 445 KiB over 61 files** — `/_nuxt/*` and `/_fonts/*` come
  back with `ETag` and nothing else. `nuxt.config.ts` already sets
  `immutable` route rules for both and documents at length why they never reach
  the browser: Plesk's "Smart static files processing" serves those files off disk
  and Nitro never sees the request. **Owner action, not code** — turning that
  feature off hands every asset to Node. Weighted 0 by Lighthouse.
- **`bf-cache`** — "Internal error", flagged by Lighthouse itself as _not
  actionable_.
- **`unused-javascript`, 20 KiB of the 47 KiB entry chunk** — the Nuxt entry.
  Nothing to remove without measurement.
- **TBT** is the largest remaining lever at weight 30, and the obvious candidate
  is already spent: `sentry.client.config.ts` removed `browserTracing` for exactly
  this reason and documents the trade. What is left is Vue hydration.

**Conclusion: no speculative performance change was made.** The report shows a
99 with one actionable item whose net effect is unmeasurable from a lab run, and
this project's own standard (see the `/_nuxt/**` comment in `nuxt.config.ts`) is
not to make host-fragile changes for weight-0 or break-even wins.

### Deviations from ARCHITECTURE.md, accepted

- **`recipe_discussions` and `recipe_images` have no `public_id`.** §6 requires
  UUIDv7 `public_id` on "externally-linked entities", and names `recipes` and
  `gourmerge_requests`. Both new tables are reachable only nested under a recipe
  the caller can already see, exactly as GourMerge Request ids are in practice
  (`/api/recipes/:id/gourmerge-requests/:gmrId` uses the internal id today). Adding
  an unused 16-byte column to match the letter of the rule would be dead weight.
  Revisit if either ever gets a top-level URL.
- **`server/utils/identiconAvatar.ts` duplicates the brand colours as sRGB hex.**
  §5 puts visual decisions in `main.css`; this runs on the server, where the
  stylesheet does not exist. The values carry a comment naming `main.css` as the
  source of truth, and `tests/unit/identiconAvatar.test.ts` asserts the renderer
  never emits an off-palette colour — so a drift shows up as a test failure rather
  than as a slightly-wrong orange.

### Images, and why the bytes live in MySQL

`recipe_images.data` is a `MEDIUMBLOB`, not a file. The deploy ships only
`.output/` + `app.js`, staged into `.output.new` and swapped by `rename`, so
anything written inside the app directory is one release away from being replaced
— or, on a rollback, resurrected at an older state. There is no persistent volume,
no object storage on the plan, and `scripts/server-backup.sh` dumps the database
only, so an upload directory would also be the one part of user content with no
backup and no restore drill. A row is transactional, cascades with its recipe,
rides the nightly dump, and travels through the GDPR export and erasure paths that
already exist.

The cost is that reads go through Node instead of the web server. That is what the
content-addressed URL is for: `?v=<sha256>` plus `immutable`, so a given URL's
bytes can never change and a replaced photo is simply a different URL.

**Watch this if the product grows.** At one ~250 KB photo per recipe the table is
trivial; at 10,000 recipes it is ~2.5 GB in the nightly `mysqldump`, which is when
object storage stops being over-engineering.

Related: **the server never decodes an image.** `server/utils/imageProbe.ts` reads
the file header and nothing else, and the browser does the resizing
(`app/utils/imageResize.ts`) — so no image-decoder CVE is reachable from a Passenger
worker, and there is no `sharp` binary to match against a host we cannot rebuild
on. The client is not trusted for it: format, dimensions and byte length are all
re-validated server-side, and the stored MIME type comes from the magic bytes, never
from the upload's own header (an SVG announced as `image/png` and echoed back would
be stored XSS on our own origin).

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

## Accepted — specified, not yet built (2026-08-09)

Requested and agreed; listed here with the constraints that shape them so the work does
not have to rediscover them. Nothing below is implemented yet.

> Both upload items that used to live here — recipe photos (2 MB, re-encoded server-side)
> and the avatar (512 kB, 1:1 crop in the browser) — have shipped. See the CHANGELOG's
> [1.6.0] entry, "Changed — uploads are re-encoded to WebP…" and "Added — a profile
> picture, cropped in the browser…". The QR-in-avatar-center idea mentioned in the original
> avatar spec was cut before being built and stays cut.
>
> Both items that used to live below — reporting, and ingredient editing — have also
> shipped. See the CHANGELOG's [1.7.0] entry, "Added — reports, and the admin role that
> reads them" and "Added — a user-created ingredient can be corrected by whoever created
> it". Built mostly as specified, with two differences worth recording: ingredient
> editability is gated on the new `ingredients.created_by` column rather than
> `ingredient_nutrition.source`, because a user ingredient with no nutrition supplied has
> no nutrition row to check `source` on at all; and a reported **person** (`targetKind:
'user'`) is deliberately excluded from `/api/reports/mine` — the spec said "visible to
> the owner of the reported artefact," which does not obviously extend to a person, and
> telling someone they were reported is a retaliation risk the product has no reason to
> take.

## Post-v1 backlog

Not scoped, not scheduled. Roughly in the order they would earn their keep.

0. **Community verification for user-added ingredients and nutrition** — the
   Community-Notes-shaped idea. A user-added ingredient is immediately usable **in that
   user's own recipes**, but does not enter the public catalogue (autocomplete for
   everyone else, explore, nutrition aggregates) until _x_ other users have confirmed it.
   Nutrition values go through the same gate, independently: an ingredient can be confirmed
   as real while its kcal figure is still pending.

   Why it is worth doing: the catalogue is shared state that any account can write to today,
   and the two failure modes are opposite — pollution ("Mehl", "mehl ", "Weizenmehl!!") and
   plausible-but-wrong nutrition, which is worse because it is invisible and propagates into
   every recipe that uses it.

   What has to be settled before writing code:
   - **Who may confirm.** Anyone signed in is brigadeable. Weighting by account age or by
     recipes published is the usual answer, and needs a decision.
   - **What _x_ is, and what happens below it.** A number that is too high means nothing is
     ever promoted, which is the same as not having a catalogue.
   - **What a confirmation means for nutrition.** "This ingredient exists" is a fact anyone
     can check; "this is 387 kcal per 100 g" is not. Consider requiring a source, the way
     `ingredient_nutrition.source` already distinguishes `swiss-blv-v7` from `curated`.
   - **Denormalised counters, in the same transaction as the vote** — the `starCount` /
     `forkCount` rule in ARCHITECTURE §6 applies here too.

   The cheap first slice, if the full thing is too much: keep user ingredients private to
   their author's recipes and let an admin promote them. That is the same data model with
   the voting deferred, and it stops pollution today.

1. **Mentions and an inbox** — `@username` in a discussion, and a GitHub-style
   notification centre. _(Absorbs the former "Notifications" entry, which predates
   discussions and is now the smaller half of the same feature.)_

   This is still the highest-value gap: someone forks your recipe, opens a
   GourMerge Request, starts a discussion or replies to yours, and **nothing tells
   you**. Discussions made it worse, not better — the app now invites strangers to
   write on your page and then keeps it a secret. A mention is the other half: a
   thread where you cannot pull someone in is a thread that only reaches whoever
   happens to look.

   Shape: one `notifications` table (recipient, kind, actor, target, `read_at`),
   written in the same transaction as the event that causes it. A header bell with
   an unread count, an inbox page, per-kind mute.

   The constraints that will actually decide the design, none of them optional
   here:

   - **The DB is the queue.** No Redis, no background worker, and Passenger runs
     several processes — so there is nowhere to hold a job in memory (the same
     reason the rate limiter is a table). Writing a row per recipient inside the
     event's own transaction is the only version that cannot lose a notification
     or double-send one.
   - **A mention must not become an oracle.** Mentioning someone in a **private**
     recipe's discussion would tell them a recipe exists that they cannot open.
     Either suppress the notification when the target cannot see the recipe, or do
     not offer the mention at all — but decide it deliberately, because the whole
     `requireVisibleRecipe` effort is undone by one notification row.
   - **Rendering `@name` goes through the existing sanitiser.** Discussion bodies
     are Markdown rendered by `app/utils/markdown.ts`'s allowlist. A mention has to
     become a link on that path, not by pre-injecting HTML into the stored body —
     otherwise the one place in the app that is careful about user HTML gets a
     bypass.
   - **Email is where this gets dangerous.** `sendMail()` falls back to a
     `streamTransport` that succeeds while delivering nothing. The inactivity sweep
     already learned that the expensive way — it would have stamped "notified" and
     deleted accounts unwarned. Any notification email needs the same refusal to
     run without real SMTP, plus a digest: one row per event is fine, one mail per
     event is a spam complaint.
   - **`actor_id` is another RESTRICT foreign key.** There are already six, and
     `hardDeleteUser()` has to reassign every one of them to the ghost or account
     erasure fails outright on `ER_ROW_IS_REFERENCED`. Notifications must be in
     that function and in the GDPR export the day they are added, not after.
   - **Polling, not realtime.** No websockets on this host worth betting on. An
     unread count on an interval, cached, and cheap — it will be requested on every
     page by every signed-in visitor, which is the same hot path the avatar
     endpoint had to be careful about.

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
