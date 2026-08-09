# Changelog

All notable changes to GourMerge are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/).

## [1.6.0] — 2026-08-09

Two features the collaboration loop was missing, one that was ruled out by an old decision
and is not any more, a navigation pass, and a security sweep that found the worst bug in the
project's history sitting in an endpoint nobody had reason to look at.

### Security — three endpoints answered for private recipes, one of them completely

Reading every `GET` under `/api/recipes/:id/` in one sitting turned up three that never
checked visibility while the other twelve did. The third is the one that matters:

`/api/recipes/:id/diff` had **no** visibility check **and** never scoped its `?from=` /
`?to=` commit ids to the recipe in the path. The path parameter was decoration. So
`/api/recipes/<any public recipe>/diff?from=1&to=2` returned the ingredients and the steps of
commits 1 and 2 — from whatever recipe those commits happened to belong to, private or not,
with no session at all. Recipe and commit ids are sequential integers. Walking them read the
whole table.

The other two were quieter but the same shape: `/commits` handed out a private recipe's
entire history (commit messages, author names, timestamps) to anyone, and `/branches` its
branch names. Commit messages in particular are prose somebody wrote assuming nobody outside
could read them.

None of this needed a clever attack. It needed someone to change one number in a URL.

The fix worth describing is not the three `if`s. It is that **each of the fifteen endpoints
carried its own hand-written copy of the rule**, twelve were complete and three were not, and
nothing in the codebase could tell you which — no shared helper, no test that walked the
list, nothing. They now go through one `requireVisibleRecipe()` /
`requireCommitInRecipe()`. The commit-scoping half is the easiest to forget because
`recipe_commits` has no `recipe_id` of its own; it belongs to a branch, which belongs to a
recipe, so scoping it takes a join and omitting it looks like nothing is missing.

404, never 403, for a private recipe — a 403 confirms the id exists, and on sequential
integers that is the disclosure by itself. `tests/e2e/api/private-recipe-leaks.spec.ts` walks
all three plus the cross-recipe commit case.

### Fixed — an early rejection killed the _next_ request on the connection

Found while testing an upload cap, then reproduced against an endpoint that predates all of
this: `POST /api/recipes` with a 4 MB body and no session answered 401 correctly, and then
the following `/auth/register` on the same keep-alive connection died with `ECONNRESET`.

Any guard that answers before reading the body — `requireUserSession`, an ownership check,
a size cap — leaves unread bytes on the socket. Node destroys it after the response, and the
client's next request over that connection gets nothing. The failure therefore lands on an
unrelated, innocent request, which is the worst possible place for it: neither request
suggests the cause. `Connection: close` on an errored response whose body was never consumed
(RFC 9110 §6.1), guarded so ordinary 4xx keep their connection.

### Added — discussions, on a recipe and on a single commit

The collaboration loop had exactly one place to say anything: a comment on a GourMerge
Request, which you reach only after forking, branching, editing and proposing. "I used oat
milk and it worked" had nowhere to go.

Threads carry a title, a category (idea / question / issue / praise), a Markdown body,
replies, and an open→resolved state. Modelled on GitHub Discussions rather than Issues — a
thread resolves, it does not get assigned, labelled or milestoned.

**They sit under the recipe, not beside it.** A side rail was the other candidate and it
loses on every axis: the reading column is capped at `max-w-4xl` because that is the measure
a recipe reads at, so a rail comes out of that budget and makes both halves worse; below
`lg` a rail collapses underneath anyway, which means designing the stacked version
regardless; and a recipe is used on a phone, where the rail _is_ the stacked version.

**Commit level was worth answering before building anything, and the answer is yes,
cheaply.** A note about one snapshot has the identical shape to a note about the dish — same
table, same endpoints, one nullable `commit_id`. It earns its place in this product
specifically: "this is the version that worked, the next commit over-salted it" is a remark
about one commit and belongs on it. The history page opens it per commit in a modal so the
timeline stays scannable.

Moderation splits deliberately. Only the **author** may edit the text — nobody puts words in
someone's mouth, the recipe owner included. The **owner** may resolve or delete, because this
is the first place in the app where strangers write onto their page and without a removal
path moderation would mean deleting the recipe. Rate limits are keyed on the **user**, not
the IP: the limit protects other people's recipes from one account, and an IP key would let
one account spread across addresses while punishing a shared NAT.

### Added — one serving-suggestion photo per recipe

This revises **locked decision 2**, which read "no images, no uploads — text only". Step
content still cannot contain an image and there is no general upload surface; a recipe may
carry exactly one photo.

It renders **between the ingredients and the steps**. That is the seam where the reader stops
asking "do I want this / what do I need to buy" and starts asking "how do I make it", and it
is the one moment a picture of the finished dish is worth something. At the top it competes
with the title for the first impression and pushes the ingredient list — the part people
actually scroll to — below the fold on a phone.

**The bytes live in MySQL, not on disk.** The deploy ships only `.output/` + `app.js`, staged
into `.output.new` and swapped by `rename`, so anything written inside the app directory is
one release away from being replaced or, on a rollback, resurrected at an older state. There
is no persistent volume, no object storage on the plan, and `server-backup.sh` dumps the
database only — a filesystem upload directory would also be the one part of user content with
no backup and no restore drill. A row is transactional, cascades with its recipe, rides the
nightly dump, and travels through the GDPR export and erasure paths that already exist. The
cost is that reads go through Node, which is what the content-addressed URL
(`?v=<sha256>` + `immutable`) pays for.

**The server never decodes an image.** The browser downsizes to 1600px WebP and the server
reads the file header only — a few dozen bytes, no decoder, so no decoder CVE is reachable
from a Passenger worker, and no `sharp` binary has to match a host we cannot rebuild on. The
client is not trusted for any of it: format, dimensions and byte length are re-validated, and
the stored MIME type comes from the **magic bytes**, never the upload's own header. That last
one is not theoretical — an SVG announced as `image/png`, stored and echoed back with the
announced type, is stored XSS on our own origin, and `img-src 'self'` does nothing about it
because the browser never treats the response as an image.

### Changed — one home per destination, and the logo finally lines up with the content

The signed-in shell carried a 256px sidebar listing four destinations that were **also** in
the header nav and **also** in the user dropdown, plus two "quick actions" duplicated in
both. Fifteen entries for nine destinations, and no rule anyone could infer about which copy
to use. It is gone. Navigation now lives in exactly two places with distinct jobs:
`MainNav` for destinations you move between while working, `UserDropdown` for your account.

Removing it fixed a second thing for free. With a sidebar the header is centred in the
_window_ while the content column starts after the sidebar, so the two frames can never
agree — the previous attempt at that alignment needed a documented block of magic numbers in
`main.css` (`--gm-shell-lead`, `--gm-shell-trail`) pinned by an E2E test, and still only
worked from `lg` up. Both are now the same `max-w-7xl` container in the same viewport, so a
`wide` page's content begins exactly under the logo at every width, with no CSS at all. The
logged-out `/explore` state had been doing this right all along.

### Fixed — the header was clipped between 768px and ~1000px, and so was the recipe row

Two instances of the same fault, found by measuring rather than by looking, because neither
overflows visibly — the shell is `h-dvh overflow-hidden`, so an over-wide row is silently
**clipped** and the page does not scroll.

The app header wanted **949px against a 768px viewport**: the account menu and the theme
toggle were simply not on screen between `md` and ~1000px. The desktop cluster now starts at
`lg`, where there is room; below it the offcanvas menu already carried every one of those
destinations.

The recipe page's header row was worse because it picked a loser. The action cluster held six
`sm` buttons at a fixed 578px with `shrink-0` — it could not shrink — while the identity line
beside it carried `min-w-0`. So the recipe name was structurally the side that gave way: at
640px it was squeezed to **zero width** and vanished, at 768px the slug was fully truncated,
and even in the full 832px content column it got 238px and showed 93px of a 435px name. Six
buttons legible, the name of the page not. The row now stacks until `lg` and the cluster
wraps instead of monopolising.

Both are asserted at seven and six widths respectively, so a fifth nav item or a seventh
action button fails a test rather than quietly eating something.

### Changed — an identicon-QR badge instead of a username in the header

The header showed the signed-in username, a variable-width string in a fixed row that moved
the whole control cluster by up to ~70px depending on who was signed in. It shows an avatar
now.

Users without an uploaded picture get a mark generated from their username, in two renderings
picked by size. `badge` (from `lg`) is an identicon bezel around a soft-dotted QR of their
profile URL — point a phone at it and it opens the profile. `mark` (below `lg`) is the
identicon alone, because **a QR at 32px is not a small QR, it is grey noise**: the modules
fall under a pixel and it is neither scannable nor recognisable, failing both halves of its
job at once. At that size the job is "tell two users apart at a glance".

Colour comes only from the two brand ramps, never a per-user hue. Individuality is geometry.
A random hue per account is what GitHub does and it would make a comment thread look like a
bag of sweets next to a saffron-and-slate product.

The symbol is **inverted** and in brand colours, with the chef's hat set into the middle. A
QR does not need to be dark-on-light — it needs its two states to **binarise apart** — so
the code is now the ramp's 300 on its 950, measured at 9.5:1. That is _more_ contrast than
the dark-on-light version it replaced, because both ends moved, and it is what lets the
badge be a dark brand object instead of a pale one. The caveat is stated rather than hidden:
ISO/IEC 18004 defines a symbol as dark-on-light and says readers **should** also handle
reflectance reversal; iOS, Android's ML Kit and every mainstream scanner do, a strict or very
old decoder may not. Undoing it is swapping two colours per ramp — the geometry, the quiet
zone and the tests are all polarity-agnostic.

The logo costs error correction `H` rather than `M`, which grows the
symbol and shrinks each module; the knockout is 24% of the width, about 6% of the area,
comfortably under a third of what `H` reconstructs. The artwork is read from
`public/icon.svg` at runtime rather than becoming a third hand-copied set of path data.

Machine readability is **measured, not asserted**: the test rasterises the real SVG and
samples the centre of every module against the matrix `qrcode` produced. Exact from 256
device pixels, with ~1% of modules blurring at 192 — which is the 1×-display worst case,
since the profile badge is a 192 **CSS**-pixel box and a phone held to a screen sees its
device pixels. It earned its keep three times over: the first eye corner radius looked
lovely and had silently deleted seventeen modules (the bound is geometric — above ~1.71
modules the rounding arc excludes the corner module's own centre), and the logo's pad was
painted over dots that had already been drawn, erasing a ring of them.

### Fixed — nine badges below AA in light mode, and the rule that lets them ship

`variant="subtle"` paints Nuxt UI's `text-<color>` — the semantic 500 — on a 10% wash of the
same hue. In light mode `success` measures **2.03:1**, less than half of AA. The design book
said this was "solved centrally", which is why nobody looked; it is solved centrally for the
brand ramp and for neutral text, and the four semantic ramps need a `.tint-*` class at the
call site. Nine did not have one, across the diff viewer and the nutrition panel.

Fixed, and then made mechanical — `design:check` rule 14 fails on a semantic subtle badge
with no tint, and that rule is how eight of the nine were found. The first came from adding
a recipe page to the axe sweep, which had never scanned the highest-traffic page in the app.

### Performance — 99 / 100 / 100 / 100 on mobile, and why it stays 99 for now

The missing point is arithmetic: FCP 0.95 (×10) + LCP 0.99 (×25) + TBT 0.98 (×30) + CLS and
Speed Index at 1.00 sums to **98.65**. Reaching 100 needs ≥ 99.5, and fixing FCP _and_ LCP
outright yields 0.75 — no single change gets there.

The one actionable item is the render-blocking `entry.css`: measured at 237,678 B raw /
**25,148 B brotli** against a ~12 KB document. Inlining it removes one round trip and roughly
triples the HTML on every request; because this host serves `/_nuxt/*` with no cache headers
at all there is no repeat-visit cache to lose either, which makes it close to break-even
rather than the clear win the audit's savings model implies — and unverifiable without a
production run. Deliberately not done. `cache-insight` is a host setting, `bf-cache` is
flagged by Lighthouse itself as not actionable, and the obvious TBT lever was already spent
when browser tracing came out of the Sentry client.

Full reasoning, the open backlog it produced, and the accepted architecture deviations are in
`.claude/ROADMAP.md` under "Audit — 2026-08-09".

## [1.5.0] — 2026-08-07

The first release written after the site had real users hitting it, and it shows: most of
what follows was found in production logs, in Sentry, or by pointing `curl` at the live host
rather than by reading code. Two entries are outages, one is a feature nobody could reach,
and several are error handlers that were themselves the error.

### Fixed — logout did nothing, from the desktop header or the mobile menu

Every menu item's action was wired as `click: handler` — the Nuxt UI **v3** item API. In v4
a menu item reads `onSelect`; `click` is simply not a property the renderer looks at, so the
entry renders, looks exactly like every other item, and does nothing when clicked. `git blame`
dates the lines to before this app moved to v4, so nobody has been able to sign out from the
desktop header or use the help menu's "Start tour" / "Reset onboarding" since. Nothing caught
it: the item type extends `LinkProps`, which pulls in Vue's own HTML attribute types, so even
an explicitly-typed array accepts `click` without complaint. A new ESLint rule is the only
thing that actually fails on it now.

A second, unrelated bug was hiding behind the same click: the sidebar, the mobile menu and
the account dropdown all bind a _dynamic_ `:to` on a bare `NuxtLink`, and `@nuxtjs/i18n` only
rewrites a _static literal_ `to` — the same class of bug already fixed once in the logo. On
`/en/dashboard` the page carried both `/en/recipes` (from the static header) and a bare
`/recipes` (from the sidebar) at once. Every sidebar and mobile-menu path now goes through
`localePath()`; the dropdown didn't need it, once reading `LinkProps` showed Nuxt UI already
renders those items through `ULink`, which auto-localises on its own.

### Fixed — the onboarding tour looked stuck on step 2, forever, then just gave up, then still did nothing, then still looked like nothing changed, then left visitors to fill in the form alone

It wasn't stuck; it was silent. Four of the six tour steps anchored on a demo recipe,
resolved once at tour start. When no recipe was available to demo on — no public recipe
from another user, and none of the viewer's own — the original code still visited each of
those four steps in turn, waited out a full 2.5-second anchor timeout on a page that could
never have the anchor, and only then moved to the next one. Up to four rounds, up to ten
seconds, with the step panel hidden and nothing but a dimmed backdrop on screen —
indistinguishable from broken by watching it. It then ended the tour with zero feedback,
which on a phone reads as the tour having crashed rather than finished.

The first fix only treated the symptom: recognise the unreachable step immediately instead
of waiting it out, and show a toast on early end instead of vanishing silently. Faster, but
still a tour that gives up and shows nobody the fork/star/history/GourMerge-Request steps
whenever the install (or just this viewer's account) has no recipe lying around to demo on
— which, for a brand-new signup mid-onboarding, is exactly the common case, not an edge one.

The second fix sent the `new-recipe-btn` step through the **real** `/recipes/new` form
instead of searching for something pre-existing, with star/history/GMR demoing on the
recipe just created rather than one that may not exist — reported back immediately as
having changed literally nothing. It hadn't, for the simplest possible reason: the panel's
own "Weiter" button — the one every visitor had just clicked five times in a row out of
habit — still just called `tour.next()`. It never created anything; it advanced the step
index, found star/history/GMR equally target-less, and silently cascaded straight through
to the exact same "no recipe available" toast this whole rework exists to avoid. A visitor
who clicks "Weiter" is not an edge case; it is the interaction the previous five steps
trained them to make.

The actual fix: `new-recipe-btn` overrides what its OWN "Weiter" button does
(`TourOverlay.handleNext()`), so it leads to the real create-recipe form exactly like the
highlighted link does — there is no button on this step that skips creating a recipe short
of abandoning the tour outright ("Tour überspringen"). The demo recipe defaults to private
(a fresh signup has not verified their email yet, and publishing publicly is gated on that)
and is deleted again the moment the tour ends, finished or skipped, so onboarding doesn't
leave demo debris in anyone's account. Only Fork still needs someone else's public recipe
(forking your own brand-new one makes no sense) and is now the last step for exactly that
reason; it still degrades gracefully when none exists. Three Playwright tests cover it:
"Weiter" leading to the real form rather than past it, the full
create-through-the-real-form-then-delete path, and fork resolving once a recipe exists.

A fourth report landed anyway: still the same toast, still looked unchanged. It was —
production had (and at the time of writing, still has) zero other public recipes, because
publishing itself was broken until the fix earlier in this changelog. `fork-button` is
unreachable for literally every visitor right now regardless of whether create/star/history/
GMR all worked, and it showed the identical "no recipe available" wording either way — a
visitor who had just watched the first five steps succeed had no way to tell that apart from
the original all-or-nothing failure. `finishEarly()` now checks which step it's ending on:
`fork-button` specifically — which, given the step order above, is the only one `isLast`
can ever be true for anymore — gets a distinct, positive "tour complete, forking needs
someone else's public recipe" toast instead of the generic early-end one. The generic wording
is kept for the (now-defensive-only) case of a visitor abandoning the create-recipe form
mid-fill.

Still not the end of it: "you didn't fix the recipe creation process, still have to go
through it without help." That one was a real design gap, not a data-availability story
like the toast wording — `suspended` hid the ENTIRE tour overlay, panel included, the
instant the visitor reached `/recipes/new`, so the real form was usable but the tour gave
zero guidance while they filled it in. "The tour creates a recipe together with the user"
cannot mean "the tour vanishes at the door."

The form itself is now a real step (`recipe-form-title`), anchored on the title field,
staying visible and guiding the visitor while they fill the form in — `hideNext: true`
removes the "Weiter" button entirely for this one step, so there is no click that skips
past it short of abandoning the tour outright. Reaching it turned out to have two paths:
the panel's "Weiter" on the preceding step (a normal `tour.next()` now — no override
needed, since the next step's own route IS the form) and the highlighted "+ Neues Rezept"
link clicked directly, which bypasses `tour.next()` entirely. Only the first path was
covered before; a second `route.path` watcher now advances the step for the direct-click
path too. The create-recipe form reads the tour's own reactive `active` flag directly to
default visibility to private, rather than a `?tour=1` query that only the "Weiter" path
would have carried consistently — which also let the dashboard button go back to a plain
static `to`, since a dynamic one would not have been auto-localised by `@nuxtjs/i18n` (the
same class of bug already fixed once elsewhere in this codebase).

### Added — change your account's email address

Settings had no field for it, and the API didn't accept one either — there was no path to
this at all, not a broken one.

Built as a confirm-by-link flow rather than an immediate write, on the same reasoning
already applied to password reset: a signed-in session is not proof that the person typing
is the account owner, and a typo here can lock someone out of every recovery path that
depends on the address being correct. Requesting a change asks for the current password and
mails a confirmation link to the **new** address — nothing about the account changes yet.
Only clicking that link switches it, and because clicking it is proof of ownership, it also
re-verifies the address in the same step, so `REQUIRE_EMAIL_VERIFICATION` can't be
sidestepped by switching away from the address that was actually verified. The **old**
address also gets a plain notice with no link: if the change wasn't requested by the account
owner, that mail is the only signal something is wrong, and it says outright to change the
password.

### Fixed — every account in production was permanently barred from publishing

Creating a public recipe answered `403`. So did making an existing recipe public, and so did
opening a GourMerge Request. The cause was a gate with no door: `REQUIRE_EMAIL_VERIFICATION`
is `true` in production, but `/auth/register` never sent a verification mail — it inserted
the user and set the session. `email_verified_at` stayed `NULL` forever, because the only
thing that sets it is `/auth/verify?token=…`, whose token only `/auth/send-verification` can
issue, and **no screen in the app ever called that endpoint**. Every account was unverifiable
by construction.

- Token minting and the mail now live in one place, `server/utils/emailVerification.ts`, and
  registration sends it. Best-effort inside a `try`/`catch`: the user row is already
  committed at that point, so a dead SMTP host must not answer `500` to a signup that
  succeeded — the user would retry and hit the `409` for their own brand-new account.
- An unverified-email banner across the authenticated shell, with a resend button. That is
  the way out for the accounts that already exist; without it, fixing registration would only
  have helped people who had not signed up yet.
- `/auth/verify` refreshes the session when the link is opened in the browser that is already
  signed in as that user, so the banner disappears on the spot instead of nagging someone who
  just complied. Guarded on the user id — the link may well be opened on a shared machine.
- The `403` now says what is wrong. `useApiError` deliberately never echoes the server's
  `statusMessage`, which meant this one read "you do not have permission to do that" and sent
  people looking for a permissions problem that did not exist. Endpoints can now attach a
  stable `data.code`, and only codes in an allow-list resolve to a translated message — the
  escape hatch that composable's own docblock had been asking for.

The unit test written for that lookup caught a bug in it immediately: `code: 'constructor'`
resolved off the prototype chain and would have rendered `[Function Object]` on screen.
`Object.hasOwn` now, own keys only.

### Fixed — a stray space in `LOG_LEVEL` was killing the process on every error

The cause of the production 502s, from a Sentry stack trace:

```
Error: default level:info  must be included in custom levels
    at assertDefaultLevelFound (pino/lib/levels.js:194)
```

Note the double space. The value was `"info "` — a trailing space in the Netcup panel's
environment-variable field. pino rejects an unknown level by **throwing**, and the logger is
built lazily on first use, which in a healthy request cycle is frequently `logger.error()`.
So an error would occur, the app would try to report it, the logger would throw from inside
the error handler, and the process would die mid-response. Passenger reported "Incomplete
response received from application"; the browser got a 502.

`resolveLevel()` trims, lowercases, checks against pino's seven levels and falls back with a
`console.warn`. Ten cases in `tests/unit/loggerLevel.test.ts`, including the exact `"info "`
that caused it. A logger exists to report failure and must not be capable of causing one.

### Fixed — the deploy's smoke test caused the outage it was meant to catch

The site came back up on its own with nobody touching it, which rules out a broken release
and convicts the check. Passenger spawns on the first request, and a cold start of a 26 MB
artifact on shared hosting has to get through Nitro, Sentry and auth-utils before anything
answers — until then Apache serves the document root, which is why the check saw 403/404 from
a host that was fine. `6 × 10s` rejected a release that was merely still spawning, and the
rollback then swapped a **working** build out for an older one.

There is no signal separating "still spawning" from "will never start"; only elapsed time.
The budget is now `16 × 15s`, and expiry means broken rather than slow. The deploy also names
who answered the smoke test and verifies that the rollback it performs actually restored a
serving release.

### Added — sign in with email **or** username

The login form validated its field as an email address, so a user who knew their username was
told their own name was an "invalid email address" before the request was even sent.

The endpoint matches both columns now, and they can never collide: usernames are validated at
registration as `[a-zA-Z0-9_-]+` and therefore cannot contain an `@`, while an email address
must — so a value addresses exactly one of the two unique columns. The field is `type="text"`
with `autocomplete="username"`, because `type="email"` would have made the browser refuse to
submit a bare username. The old `email` request field is still accepted, so a browser running
the previously cached bundle can still sign in during the minutes after a deploy.

### Added — SEO: hreflang, per-locale canonicals, localised metadata, `/llms.txt`

Production shipped no canonical, no hreflang and English metadata on every locale. With
`prefix_except_default`, `/` `/en` `/fr` `/it` are four URLs carrying the same content, and
without alternates a crawler has to guess they are translations rather than duplicates — it
picks one and drops the rest, so three quarters of the translation work never reaches search
results.

`useLocaleHead({ seo: true })` emits the canonical and stops; the module keeps alternates
behind `experimental.strictSeo`, which 500s every page here. Enabling it earned its keep once
anyway — it turned a silent omission into an error revealing that the locale definitions had
no BCP47 `language` tags at all. Those are added, region-less on purpose (`de-DE` would claim
we target Germany rather than German speakers). The alternate set is ten hand-rolled lines in
`app.vue`, including the `x-default` most otherwise-correct implementations forget.

`app/pages/index.vue` had a hardcoded English title and description, which is worse than an
omission: a page-level `useSeoMeta` overrides the site-wide one, so `/fr` served a French page
with an English `<title>` and search snippet. Also `/llms.txt`, as a route rather than a
static file for the same reason `robots.txt` is one — the URLs must be absolute and the host
is only known at runtime.

### Changed — the document head no longer preloads the entire application

Mobile Lighthouse measured 57 script requests totalling 326 KiB, **all started at t=116 ms at
priority High**, because Nuxt emits a `<link rel="modulepreload">` for every chunk the entry
statically imports. On the mobile profile's 1.4 Mbps link that is ~1.8 s of transfer, and the
render-blocking stylesheet sat in the same queue competing for it. The two numbers that make
the case: unthrottled FCP is 290 ms and simulated FCP is 2550 ms — the gap is almost entirely
bandwidth, spent on JavaScript the first paint does not need. The page is server-rendered, so
the HTML is already complete and the scripts are `type="module"` and deferred by definition.

- A `build:manifest` hook drops `preload` and `prefetch`. The chunks are still fetched; they
  are merely discovered after the entry parses, once the stylesheet has had the pipe to
  itself. Verified on a production build: the head went from 20+ preload links to zero, with
  the stylesheet and entry script untouched and the page still rendering its LCP element.
- `zod-locale.client.ts` imported Zod **and all four locale packs statically**, putting them
  in the entry chunk — executed at boot on every page, including a marketing homepage with no
  form on it. Now loaded on idle or first interaction. Zod, the locale packs and `motion` all
  left the entry chunk as a result.
- Sentry's browser tracing is off. It installed PerformanceObservers and navigation
  instrumentation on the main thread during exactly the window scored as Total Blocking Time,
  which carries more weight than any other metric. Error capture — the reason Sentry is here
  — is untouched. This is the one change with a real cost: field performance data from actual
  visitors, which is better evidence than any lab run. One line to revert.

Deliberately **not** done: inlining the stylesheet. It is 233 KB raw, and parsing that at 4×
CPU throttling inside the FCP path is likely a net loss, on top of adding 28 KB to every HTML
response and removing the file's caching entirely. Critical-CSS extraction is the correct
form of that idea and needs a dedicated extractor.

### Fixed — the service worker threw on every navigation, twice

```
Uncaught (in promise) non-precached-url: non-precached-url :: [{"url":"/"}]
```

`navigateFallback: '/'` names a URL Workbox serves **from the precache** when a navigation
cannot be fetched, so that URL has to be in the precache manifest. The manifest comes from
`globPatterns` matching files on disk, and this app is server-rendered — there is no
`index.html` for `/`, so the entry could never exist. The first attempt removed the config
key entirely, which turned out not to remove anything: `@vite-pwa/nuxt` fills in its own
`navigateFallback` default — `'/'`, again — for any workbox config that doesn't already have
the key, so the built `sw.js` kept the exact same broken registration. The actual fix is
`navigateFallback: null`, which the module's own "is this key present" check accepts as
present, and which Workbox's template treats as falsy and skips entirely. Runtime caching for
assets and the recipe API never involved the precache and is untouched either way.

### Fixed — icons called a third party on every page render

`[Icon] failed to load icon 'lucide:compass'` filled every E2E and a11y log. The browser
console from production had the chain: the page fetched `api.iconify.design`, our CSP refused
it, and the retry against `/api/_nuxt_icon/` came back 502.

`clientBundle.scan` is off by default, and the icons the build log reported all came from
Nuxt UI's own hook — every icon _we_ put in a template was absent, so `loadIcon()` fell
through to the network loader. Two false starts are recorded in the commit, including listing
the eleven failing names explicitly, which fixed those eleven and surfaced five more the
moment another page rendered. `scan: true` is the actual fix, and `fallbackToApi: false`
closes the other half: fetching icons from someone else's server sends every visitor's IP to
a third party before any consent, the same problem as the Google Fonts `<link>` that was
removed earlier. Verified at zero warnings across four pages and zero external requests.

### Changed — the Swiss seed no longer re-imports 1191 rows on every deploy

Fifteen minutes per release, three sequential round trips per food against a MySQL on a
separate host, all to rewrite rows that already matched. One `COUNT` decides it now: `source`
already carries the dataset version (`swiss-blv-v7`), so a new BLV release changes the string
and the check stops matching by itself. Verified against a populated database at 0.9 s. The
loop is still row-at-a-time, so a genuinely new dataset still costs a quarter of an hour —
the recurring cost was the part that mattered.

### Fixed — the logo dropped the chosen locale

Pick another language, browse, click the logo, and the site was German again. The logo's
target is a runtime expression, `loggedIn ? '/dashboard' : '/'`, and that is the whole bug:
i18n localises a `NuxtLink` whose `to` is a static literal, which is why the rest of the nav
survived language changes and made this look like a session problem. It cannot rewrite a
ternary evaluated at runtime, so the logo pointed at the unprefixed path — and under
`prefix_except_default` the unprefixed path _is_ the default locale. Both layouts use
`localePath()` now, including the one that already worked, because "this link keeps your
language" should not depend on how the target happens to be written.

### Fixed — unknown profiles answered `200`

`/[username]` is the widest route in the app, so every unmatched single-segment path landed
there: `/backups`, `/app.js`, `/.my.cnf` all returned `200` with the profile page rendered
inside. That made every typo an indexable URL, and it made "is this file exposed?"
unanswerable from a status code. `setResponseStatus(event, 404)` rather than `createError` —
the status was wrong, the page was not, so a mistyped username still gets the styled
"profile not found" state while crawlers and scripts get the honest code.

The deploy now also asserts on every release that `backups/` and `.my.cnf` are not reachable.
The assertion is on **content**, not on the status code, precisely because of the bug above:
an app answering with its own page looks identical to a 200 serving a file.

### Fixed — the header navigation differed depending on which layout you were on

Signed in, on a `/legal/*` page, "Meine Rezepte" was missing. `default.vue` and
`dashboard.vue` each carried their own hand-written copy of the nav and the copies had
drifted — four items in one, three in the other. A user's navigation gained and lost an item
as they moved around, with no rule they could infer. There is one copy now, `LayoutMainNav`,
rendered by both layouts.

### Added — skeleton shimmer, on the third attempt

The first two versions animated correctly; the _gradient_ was wrong. A three-stop ramp has a
discontinuous first derivative at each stop, and the eye reads those kinks as the band's own
edges — so it looked like a rectangle sliding past rather than light crossing a surface. The
upstream `tw-shimmer` plugin samples a sine falloff across seventeen stops bunched toward the
peak, and after rebuilding it by hand twice the plugin itself is now the dependency.

### Changed — Sentry reported healthy behaviour as issues

`server/plugins/error-handler.ts` has always documented the policy — "4xx are intentional —
skip" — but that hook only governs the app's own logger. Sentry's Nitro instrumentation
captures every thrown `H3Error` independently, so the policy applied to the log file and
nowhere else: every scanner that POSTed to `/api/*` with a foreign `Origin` raised a
`CSRF: origin not allowed` issue, and 404s from link rot filed themselves next to real
crashes. Alerts that fire on healthy behaviour get muted, and then the 500 that mattered is
muted with them. A `beforeSend` filter now drops expected 4xx.

The CSRF rejection itself gained a log line with the offending origin, method, path and user
agent. It previously threw a bare sentence, which made the two cases that produce it — a
scanner, and a real visitor whose browser sent an origin we did not anticipate —
indistinguishable after the fact. The response body still says nothing beyond the status.

### Security — host, database and SSH identifiers redacted from a public repository

Prompted by spotting the Plesk system user, which doubles as the customer number, in
`docs/SECRETS.md`. Verified rather than assumed: the repository is public, `origin/master`
contained none of these values, and all three commits that introduced them were unpushed —
nothing had leaked. No passwords, tokens or keys were present anywhere in tracked files.

### Changed — CI, deploys and dependencies

- **E2E now runs on PRs that touch the dependency manifest.** CI did lint, design-check,
  typecheck, i18n, unit tests and build; none of those touch a passkey, a fork, a GourMerge
  Request or a merge. All of that lives in the E2E suite, which only ran on push to master —
  so a dependency bump could be green on its PR and break the product after merge.
- **`@simplewebauthn/{browser,server}` 11 → 13.3.0.** Two majors on the packages the passkey
  flow depends on, against a `^11.0.0` optional peer in `nuxt-auth-utils`. Reading the code
  inverted the initial rejection: it calls the object form of `startRegistration` /
  `startAuthentication`, which is v11+, and imports only four types from the server package,
  all of which still exist in 13 — the peer is a floor that was never raised, not a ceiling.
  Verified on a fresh production build rather than on the dev server, which had the old
  module already resident in the process.
- **Five GitHub Actions majors bumped**, and with them a live bug: since `upload-artifact`
  v4.4 hidden files are excluded by default, and Nitro puts deduplicated runtime dependencies
  in `.output/server/node_modules/.nitro/` — a dot directory. The shipped artifact had been
  missing a package the server requires at runtime.
- **Dependabot no longer offers TypeScript 7**, which `@nuxt/ui`'s peer range makes
  unresolvable — the PR failed at `npm ci` before a single check ran. Ignored in
  `dependabot.yml` rather than by comment, so the rule is visible to anyone reading the repo
  and deleting three lines is the entire re-enable step.
- **The E2E suite stopped being its own attacker.** `/auth/register` allows 3 requests per
  minute per IP, the suite makes ~34 registrations from one host, and the victim was whichever
  test happened to be registering when the budget ran out. The tests are not 34 different
  clients, and pretending otherwise is the fix.

### Documentation and tooling

- **`i18n:check` now rejects an unescaped `@`.** vue-i18n reads `@` as linked-message syntax,
  so a plain email placeholder makes the compiler throw `INVALID_LINKED_FORMAT` — and because
  production builds strip the message table, it surfaces as **a 500 whose entire body is the
  string `"10"`**. Nothing in that points at a translation file. It cost a debugging session
  exactly once, during this release: `du@beispiel.de` in a new placeholder took `/auth/login`
  down while every other page stayed up. The escape is `{'@'}`, genuine linked messages still
  pass, and the check is a parser rather than a regex because both forms contain an `@`.
- **The `/_nuxt/**` cache-header comment in `nuxt.config.ts` now says what is actually true.**
  It had accumulated two contradictory explanations across as many commits. Measured against
  the live site: `/api/health` returns its route rule's `no-store`, so route rules work — but
  an existing `/_nuxt/*.js` comes back with an ETag and _none_ of the `/**` security headers
  and no `x-request-id`, which nothing served by Nitro does. Those files are served off disk
  by the web server and the rule never fires for them. The earlier reading — "a non-existent
  `/_nuxt/*.js` returns Nitro's JSON 404, therefore these requests reach the app" — is true
  and proves nothing: a miss falls through to Passenger, a hit does not. The rules stay,
  because they cost nothing and start working on any host without smart static file
  processing.
- The UptimeRobot item is closed, with two caveats recorded rather than left to be
  rediscovered: `status.gourmerge.de` is a **permanent** redirect, so moving to a CNAME-based
  custom domain later means fighting cached 301s; and the alerting is unproven until a real
  pause/resume test, because a monitor nobody hears from is a dashboard, not an alarm.

### Stack / tests

**56 API endpoints · 571 i18n keys ×4 · 267 unit tests · 41 Playwright specs.**

---

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
field hint, and the translation panel lists only the other three languages.

The author's own language reappears in one case only: when a stored value would genuinely
**override** the main text — it exists _and differs from it_. That distinction matters,
because every recipe saved before this change stores `content_translations.de`
byte-for-byte equal to `content`. Treating "a value exists" as the trigger showed those
recipes the same German text twice, once per step: the exact duplication this was meant to
remove. A copy carries no information; a difference is an active override that would be
unreachable if hidden.

Saving now also **drops translations that merely repeat the main text**, in any locale, so
the existing duplicates disappear on the next commit. Safe by construction: the read path
falls back to `content` when a translation is absent, so the rendered output is identical —
it only stops the copy from shadowing later edits.

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

### Added — take the ingredient list with you

A **copy** button on the ingredients card, plus **share** where the platform offers a share
sheet. Copy first because it works everywhere; the share sheet is what actually puts the
list into Notes, Reminders or a messenger on a phone, so it appears beside it when
`navigator.share` exists — feature-detected on mount, never guessed from a user agent.

Output is plain text, because every destination accepts it and Markdown would paste as
literal syntax:

```text
Garlic Butter Chicken and Potatoes Skillet
4 Portionen

- 650 g Poulet, Brust, ohne Haut, roh (in Streifen geschnitten)
- 2 EL Olivenöl
- 1 Prise Salz, Meersalz, Fleur de sel

https://gourmerge.de/testkoch/garlic-butter-chicken-and-potatoes-skillet
```

Details that make it a shopping list rather than a dump: each line starts with a dash and a
space, which Apple Notes and Google Keep turn into a real checklist on paste; it is built
from the **display**
values, so an imperial reader gets their own units rather than grams; units are translated
(`EL`, `Prise`, not `tbsp`, `pinch`); recipe order is preserved because that is the order a
cook reads; and the source URL is appended so a pasted list can be traced back.

The formatter is a pure function in `app/utils/shoppingList.ts` with nine unit tests, and it
returns an empty string when there is nothing to list — so the buttons are simply absent on
a recipe with no ingredients rather than present and inert.

Two things the E2E spec had to get right, both worth knowing:

- It reads the clipboard back rather than trusting the toast. A button that says "copied"
  while writing nothing is the failure worth catching, and a toast-only assertion misses it.
- It runs serially. `clipboard.writeText` only resolves for a focused document, and pages in
  parallel workers contend for focus — in parallel the test failed with an empty clipboard,
  which is a property of the harness and not of the feature.

### Deferred — machine translation of recipe text

Assessed and moved to the post-v1 backlog with the findings recorded, rather than started:
it contradicts locked decision 6 ("user-generated recipe content stays in the author's
language"), self-hosting LibreTranslate wants ~2–4 GB resident which shared hosting will
not give it, and the public API would send recipe text to a third party — the same blocker
that ruled out GitHub Actions for database dumps. The cheap slice, if it is ever picked up,
is ingredient names only, offline and cached; the new dialog covers that gap by hand for
anything created from now on.

### Stack / tests

**46 API endpoints · 560 i18n keys ×4 · 251 unit tests · 39 Playwright specs.**

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

`@simplewebauthn/server` + `@simplewebauthn/browser` added. **45 API endpoints ·
22 tables · 10 migrations · 540 i18n keys ×4 · 219 unit tests · 26 Playwright specs,
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
