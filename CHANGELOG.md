# Changelog

All notable changes to GourMerge are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/).

## [1.4.0] — 2026-08-06

A pass over the recipe editor after using it on a phone. Most of what follows was
reported as cosmetic and turned out to be functional.

### Fixed — the ingredient editor could not be used on a phone

- **The ingredient name collapsed to about three characters** ("Pou", "Kart") because five
  controls shared one flex row. Rows now stack below `sm`: name full width, quantity and
  unit beneath, notes below that. `sm:contents` dissolves the wrapper at `sm`, so the
  desktop row stays a single line with no duplicated markup.
- **An ingredient could not be removed at all on touch.** The remove button was
  `opacity-0 group-hover:opacity-100`, and a touch device has no hover — so it was
  permanently invisible. Hover-reveal now applies only from `sm` up, plus `focus-visible`
  so it is keyboard-reachable on desktop.
- **Notes could be neither read nor written on a phone**: the field was `hidden sm:block`.
  The data existed; the only way to reach it did not.
- On the public recipe page, `justify-between` put the name and the measurement in a
  tug-of-war — a long note wrapped to two lines and collided with the ingredient name.

Verified at a 390 px viewport against the running app: the name field measures 266 px, the
remove button computes to opacity 1, and the row renders three inputs.

### Fixed — add buttons required scrolling to the top

`addIngredient` / `addStep` existed only in the card headers, so with a dozen ingredients
every addition meant scrolling up — while new rows appear at the bottom, where you already
are. Both lists now end with an add button too. Trailing rather than sticky: the layout is
a fixed shell with one internal scroll container, where sticky-inside-a-card is fragile for
no gain.

### Fixed — clicking the logo while signed in flashed the landing page

`pages/index.vue` redirected from its setup body with a bare `navigateTo('/dashboard')`
whose promise was never returned. Fire-and-forget: the component rendered, _then_
navigated. It now uses the `guest` middleware, which already existed and resolves before
render, server-side included. The logo also points straight at `/dashboard` when signed in.

### Changed — the working language is now named, and no longer offered as a translation

The step editor had no language marker, so it was never clear which language the main text
was in, and the translation panel offered the author their own language as one of four
targets.

Filling that box in would have been harmful, which is why this is **not** implemented as
"copy the main text into the current locale". The read path is
`contentTranslations[locale] ?? content`, so a copy _shadows_ the main field: every later
edit to the main text would silently never reach readers of that language — one language,
two sources of truth, and the stale one wins.

Instead the main editor carries a locale badge, title and description carry the locale as a
field hint, and the translation panel lists only the other three languages. One deliberate
exception: a value already stored for the author's own locale stays visible and is flagged
as overriding the main text, because recipes edited before this change can carry one and
hiding it would leave an active override with no way to edit or clear it.

### Added — a real dialog for creating an ingredient

Choosing "create X" in the autocomplete used to create a master row from a bare name at
commit time. The API had always accepted translations and a category; nothing ever asked.
The result was an ingredient findable only in the language it happened to be typed in.

The dialog now collects the canonical name, all four locale names (seeded with what you
typed), a category picked from the values already in use, and — collapsed, because most
people will not have the numbers — **optional per-100 g nutrition**: exactly the six fields
`server/utils/nutrition.ts` actually reads, stored with `source: 'user'` so it stays
distinguishable from the Swiss BLV import.

Two details that matter more than they look:

- **A nutrition row is written only when an energy value is given.** `computeNutrition`
  treats a present row with `energyKcal100g === null` as _covered_, so a row of nulls would
  claim coverage the data does not have and drag every total toward zero instead of being
  reported as missing.
- Values are accepted as strings and a decimal comma is normalised, so `0,5` stores as
  `0.5` rather than becoming `NaN` — the column is `DECIMAL`, and routing through a JS
  float would round on the way in.

Creation happens on confirm rather than as a side effect of saving, which also makes it a
deliberate act — the mechanism by which a dev database accumulates rows called
`Butter 1785947886683`.

New: `GET /api/ingredients/categories` (distinct values, for the picker) and
`tests/e2e/api/ingredients.spec.ts` — six specs covering translation search, the
energy-value rule, rejection of negative/absurd/non-numeric values, case-insensitive dedup,
and that creation requires a session.

### Deferred — machine translation of recipe text

Assessed and moved to the post-v1 backlog with the findings recorded, rather than started:
it contradicts locked decision 6 ("user-generated recipe content stays in the author's
language"), self-hosting LibreTranslate wants ~2–4 GB resident which shared hosting will
not give it, and the public API would send recipe text to a third party — the same blocker
that ruled out GitHub Actions for database dumps. The cheap slice, if it is ever picked up,
is ingredient names only, offline and cached; the new dialog covers that gap by hand for
anything created from now on.

### Stack / tests

**46 API endpoints · 552 i18n keys ×4 · 219 unit tests · 32 Playwright specs.**

---

## [1.3.0] — 2026-08-06

Passkeys. With 1.2.0's TOTP in place the obvious next step was the credential that
removes the password instead of adding a step beside it.

### Added — passkeys (WebAuthn / FIDO2, opt-in)

- **Sign in with no email, no password and no TOTP code.** Add a passkey in
  `/settings`, then use the "Sign in with a passkey" button on the login page.
  Fingerprint, face or device PIN — whatever the platform authenticator offers.
- **Usernameless.** No identifier is sent, so the browser offers whichever passkeys
  it holds for this domain and the account is resolved from the credential id the
  authenticator returns. This is why `user_passkeys.credential_id` is globally unique.
- **A passkey stands in for the whole login, and that is stronger, not weaker.** The
  private key never leaves the authenticator, so there is no shared secret to phish,
  dump or reuse; the origin is bound into the assertion, so a lookalike domain gets
  nothing — which is precisely what TOTP does _not_ give you. Demanding a code after a
  successful assertion would add friction and no security. TOTP remains the second
  factor for **password** logins. The reasoning is in the endpoint header, not just here.
- **Manage them properly**: list, rename, revoke, with "synced across your devices"
  vs "this device only" shown per key and a last-used date. Default names are guessed
  from the user agent, because you can only safely revoke a key you can identify.
- **Enrolment requires an existing session** — that is the trust anchor. An open
  registration endpoint would let anyone attach their own authenticator to your account.
  The `userName` the client sends is discarded and replaced from the session.
- **Challenges live in the database**, single-use and 5-minute TTL. Not the session:
  a passwordless login has no session yet, and Passenger runs multiple processes, so
  in-memory state breaks the moment the two halves of a ceremony land on different
  workers — the same constraint that made the rate limiter DB-backed.
- **Counter regression is treated as the clone signal it is**, with the exception the
  spec requires: synced passkeys always report `0`, because a credential that
  legitimately lives on several devices cannot keep one monotonic counter. Only a
  decrease from a previously non-zero value is refused.
- Both ceremonies **rate limited** at 10 attempts / 5 min; the session is rotated before
  a new one is issued, exactly as the password path does; and `last_login_at` is stamped,
  so a passkey-only user is never treated as dormant by the inactivity sweep.

### Fixed — two defects in the above, caught before release

- **Every enrolled passkey was invisible to the login button.** `nuxt-auth-utils` passes
  its own `authenticatorSelection` to SimpleWebAuthn, which **replaces** the default
  object outright rather than merging into it — so `residentKey` fell through to
  "discouraged" and the credential was not discoverable. Enrolment succeeded, the key
  appeared in settings, and a usernameless request could never find it: a feature that
  looked complete and could not be used. `residentKey: 'required'` is now explicit.
- **A presence-only authenticator could have bypassed both the password and TOTP.** The
  library verifies with a hardcoded `requireUserVerification: false` (its own TODO), so
  an assertion proving only that _someone touched a key_ would have minted a full
  session. Since skipping TOTP is justified entirely by "a biometric or PIN was checked",
  the app now requests `userVerification: 'required'` and independently asserts
  `userVerified` on both the registration and authentication paths.

### Fixed — the coverage gate had stopped being representative

1.2.0 added seven modules under `server/utils/**`, which the coverage config _includes_
wholesale, but its exclude list — the one that deliberately keeps DB/SMTP/session
adapters out, because unit-mocking them tests the mocks — never learned about them. The
result was a gate reporting **64% against a 75% threshold**: red, and red for a reason
that says nothing about the code. Fixed by splitting them honestly rather than by moving
the threshold:

- **Excluded** (pure I/O orchestration, proved by the API/E2E suites):
  `completeLogin`, `hardDeleteUser`, `inactivitySweep`, `retentionSweep`, and
  `maintenanceConfig.json`, which is data that v8 was counting as uncovered code.
- **Tested instead** — `seal.ts` and `pendingTotp.ts` are security primitives, not
  adapters, and were at 0%. Twenty new cases cover tamper detection on both the payload
  and the MAC, the length guard that stops `timingSafeEqual` from throwing on a short
  MAC, a correctly-signed non-JSON body, secret rotation invalidating old tokens,
  failing closed on a missing or short secret, and the five-minute expiry — which is
  the authority, because a client can keep sending a cookie whose `maxAge` has passed.
  A forgeable seal or a TTL that never expires would silently defeat 2FA entirely.

Coverage is now **93% lines / 86% branches** on the same thresholds.

### Fixed — the deploy's own safety net could not see the two likeliest failures

`GET /api/health` returned `200 {status:'ok'}` unconditionally — it even reported
`database:'disconnected'` in the body while still answering 200. Since `deploy.yml`'s
smoke test accepts any 200 and the auto-rollback keys off that test, two failures
deployed green and stayed live:

- **A bad `DATABASE_URL`** — smoke test passed, nothing worked.
- **A missing `NUXT_PUBLIC_APP_URL`** — it falls back to `http://localhost:3000`, so the
  CSRF middleware compared every request's origin against localhost and **returned 403
  on every browser mutation** (login, register, every save), while verification, reset
  and GDPR links mailed out pointed at localhost. Smoke test passed.

Both are the normal failure mode on this host, not exotic ones: the deploy ships only
`.output/` and `app.js`, so every runtime value comes from Netcup's Node.js "custom
environment variables" panel, which no deploy touches. Forgetting one is expected.

The endpoint now reports **fitness to serve**, returning **503** — which fails the smoke
test and triggers the rollback that already existed — when the database is unreachable,
`NUXT_PUBLIC_APP_URL` is absent or disagrees with the host the request actually arrived
on, or `NUXT_SESSION_PASSWORD` is missing or under 32 characters. Comparing against the
request's own host rather than a hardcoded name means it needs no extra flag and behaves
correctly in dev, CI and production; it also catches an apex-vs-`www` mismatch, which
matters because the WebAuthn RP ID is the request hostname.

Degradations that still serve return 200 with a `warnings` array instead, because a
rollback loop is worse than the degradation: unset `SMTP_*`, `TOTP_ENCRYPTION_KEY` or
`CRON_SECRET`. The body names variables but never echoes values or the configured host —
that detail goes to the log.

Verified against the built artifact in all three states: correctly configured → 200 and a
browser POST passes CSRF; `NUXT_PUBLIC_APP_URL` unset → 503 and the POST 403s exactly as
predicted; unreachable database → 503.

### Notes for the operator

No new secrets and no new environment variables. But one thing to know: the WebAuthn
RP ID is **the hostname of the incoming request** (`nuxt-auth-utils` derives it from
`getRequestURL`, and nothing overrides it), which means passkeys are bound to the exact
host they were created on. A key enrolled at `gourmerge.de` will not work at
`www.gourmerge.de` or vice versa, and localhost keys never work in production. If the
site is ever reachable at more than one hostname, redirect to a canonical one.
Migration `0009` adds `user_passkeys` and `webauthn_challenges`.

### Stack / tests

`@simplewebauthn/server` + `@simplewebauthn/browser` added. **46 API endpoints ·
22 tables · 10 migrations · 552 i18n keys ×4 · 219 unit tests · 32 Playwright specs,
zero axe violations.** The passkey specs drive Chrome's WebAuthn virtual authenticator
over CDP and run the real ceremonies — the two bugs above are exactly what a stubbed
`navigator.credentials` would have hidden.

---

## [1.2.0] — 2026-08-05

Two security/privacy features: optional two-factor authentication, and automatic
deletion of accounts that have been dormant for three years.

### Added — two-factor authentication (opt-in)

- **TOTP (RFC 6238), app-agnostic.** The enrolment QR encodes a standard
  `otpauth://totp/…` URI with SHA1 / 6 digits / 30 s, so Google Authenticator,
  Authy, 1Password, Bitwarden, Aegis and Microsoft Authenticator all work. Those
  parameters are deliberate, not lazy: Google Authenticator **ignores**
  non-default `algorithm`/`digits` values, so a "stronger" secret imports without
  complaint and then produces codes that never validate.
- **Entirely optional.** Nothing prompts for it, nothing depends on it, and an
  account without an enrolment takes exactly the login path it always did.
  Enrol and un-enrol in `/settings`.
- **Secrets encrypted at rest** (AES-256-GCM). A plaintext TOTP secret is a bearer
  token for the account — a database dump would defeat the feature it provides.
  Key from `TOTP_ENCRYPTION_KEY`, falling back to the session secret.
- **Ten single-use recovery codes**, bcrypt-hashed, shown exactly once. Without
  them a lost phone is an unrecoverable lockout, which is how 2FA rollouts turn
  into support load. Codes use an alphabet with no `0/O/1/I/L`, so a hand-copied
  code cannot be misread.
- **The half-authenticated state is not a session.** After the password step the
  server issues a short-lived HMAC-signed cookie instead. Had it been a session,
  `requireUserSession()` would already succeed and every protected endpoint would
  be reachable with only a password — the second factor would be decorative.
- **Replay protection.** A code is valid for its whole 30-second window, so the
  accepted time step is persisted and codes at or below it are refused.
- **Rate limited** at 8 attempts / 5 min on every verification path. Six digits is
  a 10⁶ space and an attacker who already has the password only needs the window
  to overlap.
- Disabling requires the **password, not a code** — so a broken phone cannot lock
  you out of the setting itself, and a grabbed session cannot strip the factor.

### Added — automatic deletion of inactive accounts

- **Three years without a login → the account is deleted**, after three warning
  emails at 6 months, 4 weeks and 24 hours. `npm run db:inactive`, nightly.
- **The clock is `users.last_login_at`,** a new column — not `updated_at`, which is
  `ON UPDATE CURRENT_TIMESTAMP` and therefore moves on any write to the row, making
  an abandoned account look active forever. Accounts that never logged in fall back
  to `created_at`.
- **Only a login resets it.** A warning email deliberately does not, or the notice
  would keep extending the very period it warns about.
- **Nothing is deleted without a final notice sent ≥24 h earlier.** Without that
  interlock the first run after deploy would delete every long-dormant account the
  same night with no warning at all. A boundary dry-run also caught a stall where an
  account crossing the three-year line mid-cycle could never be warned _or_ deleted;
  notice windows are now unbounded above and the most urgent stage wins, so an
  overdue account gets the final notice and is deleted the next night.
- **Notices are recorded only after a successful send**, so an SMTP outage delays
  deletion rather than causing a silent one. The final notice is terminal — no
  earlier-stage mail follows it.
- Email copy lives in `inactivityMessages.json`, read by both the Nitro builder and
  the cron script, because the script has no TS pipeline. A unit test asserts the
  two consumers cannot drift.

### Changed — erasure is now a real delete

- **GDPR Art. 17 erasure hard-deletes the account row** instead of anonymising it in
  place. Four FKs into `users` are NOT NULL + RESTRICT and a fork copies commits
  keeping the original `author_id`, so attribution that legitimately lives inside
  _other people's_ recipes is reassigned to a single shared anonymous `ghost`
  account first — GitHub's pattern. Name, email and profile are removed entirely.
  Both the self-service flow and the nightly job use one implementation.

### Fixed

- **Server error messages reached users untranslated.** Sixteen call sites rendered
  the API's English `statusMessage` verbatim, so a German user with a wrong password
  read "Invalid email or password". The `|| t('…')` fallback beside each one only
  fired when the server said _nothing_ — the one case it was not needed for. A new
  `useApiError()` maps HTTP status to translated copy and never shows server text.
  The 1.1.0 pass fixed client-side Zod validation but not this half.
- **An unreachable server looked like bad credentials.** With no HTTP response there
  is no `err.data`, so every failure collapsed into "check your credentials" and sent
  the user looking in the wrong place. Network failures now say so explicitly.
- `GET /api/users/[username]` now returns the account preferences only on your own
  profile. They were added for the settings fix in 1.1.0; scoping them keeps a
  public profile from exposing an email address.

### Added — HTTP-triggered maintenance tasks

- **`GET /tasks/retention` and `GET /tasks/inactive-accounts`**, guarded by a
  `CRON_SECRET` compared in constant time. This is how the nightly jobs actually run
  in production, because a shell cron **cannot work on this host**: the deploy ships
  only `.output/` and `app.js`, so there is no `scripts/`, no `package.json` and no
  `.env` — and a Plesk scheduled task does not inherit the Custom Environment
  Variables that Passenger injects. Same trap as the migration step that "could never
  run": the host does not have what the command needs. Plesk's "Fetch a URL" task type
  runs the job inside the app, which already holds the pool, the mailer and the env.
- The sweep logic moved into `server/utils/retentionSweep.ts` and
  `server/utils/inactivitySweep.ts`; the CLI scripts remain for local and manual use.
  Both paths read their schedule from `server/utils/maintenanceConfig.json`, so they
  cannot drift.
- An unset `CRON_SECRET` makes the endpoint refuse **every** request. A publicly
  reachable URL that deletes accounts would be catastrophic, so failing closed is the
  only acceptable default.

### Fixed — a silent-deletion path in the inactivity job

`sendMail()` deliberately falls back to a `streamTransport` when SMTP credentials are
absent, so it **succeeds while delivering nothing** — the right trade for local dev.
For the inactivity sweep that was silent data loss: a missing SMTP variable in
production would stamp the "notice sent" column and hard-delete the account 24 hours
later, having never warned anyone. Both the endpoint and the CLI now refuse to run
without a real transport (dry runs still work), and a new `isMailConfigured()` checks
all three credentials rather than just the host.

### Notes for the operator

- Set **`TOTP_ENCRYPTION_KEY`** (see `.env.example`). Without it the code falls back
  to `NUXT_SESSION_PASSWORD`, so rotating the session secret would invalidate every
  enrolled authenticator at once.
- Set **`CRON_SECRET`** and create the two **Plesk scheduled tasks** using the
  **"Fetch a URL"** type — not "Run a command". `docs/RUNBOOK.md` has the exact
  fields, plus a `?dryRun=1` URL to verify with first.
- Migration `0008` seeds the `ghost` row and backfills `last_login_at` from
  `created_at`. It is not restored by cloning, so re-run migrations on any new
  environment.

### Stack / tests

`otpauth` + `qrcode` added. **41 endpoints · 20 tables · 9 migrations · 516 i18n
keys ×4 · 180 unit tests · 24 Playwright specs, zero axe violations.**

---

## [1.1.0] — 2026-08-05

A design-system pass. The visible half is that the UI is now internally
consistent; the more useful half is that it can no longer drift, because the
rules are written down in `DESIGNBOOK.md` and a CI gate enforces the ones a
script can check.

### Added

- **`DESIGNBOOK.md`** — the source of truth for the UI: colour, surfaces, radius,
  type scale, buttons by rank, form controls, page widths, cards, feedback
  states, badges, icons, a11y, i18n. Every rule was derived from what already
  shipped; where the codebase disagreed with itself, the majority spelling won.
- **`npm run design:check`** (`scripts/design-check.mjs`) — fails on nine
  mechanically-detectable violations, each citing its design-book section. Wired
  into `npm run lint` and added as its own CI step.
- **Layout primitives** — `<CommonPageShell>` (three content widths, one gutter
  set), `<CommonPageHeader>`, `<CommonEmptyState>`, `<RecipeTagList>`,
  `<RecipeDifficultyBadge>`, `<LayoutFooterLinks>`, and `app/utils/ui.ts` for the
  state→colour maps that had been duplicated across pages.
- **Central component defaults** in `app/app.config.ts` — button, badge, card and
  alert variants, plus `w-full` on every form control's root slot.

### Changed

- Content width is now one of three values instead of nine, and page gutters
  match the header's (`px-4 sm:px-6 lg:px-8`) so content lines up with the nav —
  pages previously used a flat `px-4`, leaving them misaligned by up to 16px.
- All 207 arbitrary `text-[var(--ui-text-muted)]`-style classes replaced with the
  Nuxt UI semantic utilities (`text-muted`, `bg-elevated`, `border-default`, …),
  of which the codebase had been using exactly zero.
- Raw `amber-*`/`orange-*` utilities and ~15 hand-applied
  `text-*-700 dark:text-*-400` contrast pairs collapsed into brand tokens and
  five `.tint-*` classes in `main.css`.
- Button sizes now follow rank rather than taste; `size="xl"` retired.
- The `dashboard` layout no longer wraps content in its own cap and padding,
  which had been fighting each page's own wrapper and double-padding every
  dashboard page.

### Fixed

- **The Metric/Imperial setting did nothing.** `preferred_measurement_system` was
  persisted and never read — the whole conversion engine was reachable only from
  its own unit test. Recipe ingredients now render in the viewer's system
  (250 g → 8.82 oz), with canonical metric preserved for the editor, diff and
  nutrition maths.
- **`/settings` silently reset your language.** The locale and measurement
  selects were never populated from the profile, so they always showed their
  defaults — and since save submits the whole form, editing your bio reset your
  language to German. Root cause was `GET /api/users/[username]` never selecting
  those columns although the type declared them; they are now returned **only on
  your own profile**, so a public profile no longer risks exposing an email.
- **Two pages had no auth guard.** `definePageMeta({ auth: true })` on
  `/settings` and the GourMerge-Request create page was dead metadata — nothing
  reads `route.meta.auth`. Both now use the real `auth` middleware, and
  `/settings` gets the dashboard layout it was documented to have.
- **Three accessibility defects that had been shipping**, all logged by axe as
  "serious" and therefore never failing the critical-only gate: dark-mode
  `text-dimmed` at 3.74:1 (below AA) on card meta text, in-text links
  distinguishable by colour alone, and the app's only scroll container being
  unreachable by keyboard. axe is now at zero critical **and** zero serious on
  every public page in both colour schemes.
- Two auth cards were capping and offsetting themselves on top of the auth
  layout, rendering narrower and 64px lower than the login card.

### Fixed — reported during review

- **Buttons had no pointer cursor.** Tailwind v3's preflight set `cursor: pointer`
  on `button`; v4 removed it and defers to the browser default. Every button in the
  app had lost its pointer while links kept theirs, which read as "some things are
  clickable, some aren't". Restored centrally in `main.css` for buttons, `summary`
  and the interactive ARIA roles Reka UI renders on non-button elements.
- **Form validation messages were English regardless of locale.** Any Zod rule
  written without an explicit message fell back to Zod's English error map — and
  the data-request form had no messages at all. A client plugin now sets Zod's
  error map from the active locale, and all five form schemas carry translated
  messages from a reusable `validation.*` namespace. Verified in DE/EN/FR/IT.
- **Text links were a different orange from buttons in dark mode.** `.link` read
  `--color-primary-500`; a solid button reads `--ui-primary`, which is
  primary-**400** in dark mode. Both now read `--ui-primary`, and 43
  `text-primary-500` call sites became the mode-aware `text-primary`.
- **Header controls were mismatched.** The locale switcher was 28px beside 32px
  buttons, and the ghost "Log in" read smaller than the solid "Sign up" because it
  had no visible surface. One size per cluster now, and a secondary beside a solid
  is `variant="subtle"` (DESIGNBOOK §2.2). Decorative button shadows dropped —
  they made the solid bloom past its box.
- **A solid badge carried the pale-tint label colour**, rendering "Mittel" as
  amber-700 on saturated amber. `RecipeDifficultyBadge` now states
  `variant="subtle"`, which is what the `.tint-*` classes are calibrated against.
- **Explore was unreachable from the desktop header when signed out** — the whole
  nav was gated on `loggedIn`, though the mobile menu did offer it.
- **Mobile menu, signed out:** two blocks of preference chrome sat above a single
  nav link. Reordered by intent — sign-up CTA, navigation, help, then preferences
  as one compact row without the uppercase micro-headings.
- **Nutrition bar on mobile** wrapped into a ragged 3–4 line row with separator
  dots stranded at line ends. It now stacks: energy, full-width macro bar, then a
  2-column macro grid, switching to the original single row at `sm`.
- **The dev server printed a red ERROR on every start.** `@sentry/node-core` calls
  the deprecated `module.register()` on Node 26, and Nuxt routes Node warnings
  through its error channel. Suppressed for exactly that one call, so it no longer
  looks like a startup failure.

### Internationalisation

**471 keys** (up from 455) in four-way parity — display units for the imperial
and scaled-metric tiers, plus labels for the extracted components.

### Tests

**150 unit tests** (up from 132), line coverage **94.7 %** (up from 93.8 %). New:
the recipe read-path display resolution — tier thresholds from both sides, the
units that must never convert, and a check that every unit the engine can emit
has an i18n label; plus completeness invariants on the shared UI maps, so adding
a GourMerge Request status or a difficulty without a colour now fails a test
rather than rendering `class="undefined"`. All 24 Playwright specs pass against
the built artifact.

---

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
