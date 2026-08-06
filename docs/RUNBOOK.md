# GourMerge Operations Runbook

## Deploy Process

### Prerequisites

- SSH access to Netcup webspace
- GitHub repository secrets configured (see `docs/SECRETS.md`)
- Node.js available on the host (`node --version`)

### Normal Deploy (automatic via CI/CD)

1. Push to `master`
2. GitHub Actions CI runs: lint → format → knip → typecheck → i18n → audit → migrate → test (coverage gate) → build → upload artifact
3. On CI success, the deploy job (gated by the `production` environment):
   - **Waits for the `E2E` run on the same commit** and aborts unless it passed. This runs
     first, so nothing touches production if E2E fails. Re-running `CI` alone without an
     E2E run for that SHA times out after 30 min — dispatch `E2E` for the commit first
   - Checks out **the exact commit CI built** (`workflow_run.head_sha`), not master's tip
   - Runs `drizzle-kit migrate` against the production DB **from the runner** — a
     non-zero exit fails the deploy and leaves the live release untouched
   - Streams the artifact as a tar over ssh into `.output.new/` (live `.output/`
     untouched). Not rsync, and not compressed: the chroot has neither `rsync` nor
     `gzip` — only `tar`, `sh`, `mv`, `touch`, `mkdir`. SSH-level compression
     (`-o Compression=yes`) does the squeezing instead
   - Renames `.output` → `.output.prev`, then `.output.new` → `.output`, and touches
     `tmp/restart.txt`
4. Smoke test polls `https://<domain>/api/health` (6 × 10 s). On failure the deploy
   **auto-rolls back** to `.output.prev`

> **Migrations run from the CI runner, not over SSH.** The Netcup webspace has neither
> `drizzle-kit` nor the migration SQL (only `.output/` + `app.js` are shipped), so the
> production MySQL must accept connections from GitHub Actions. If the DB is firewalled
> to the webspace only, see _Manual migration_ below and drop the migrate step from
> `deploy.yml`.

**Runtime configuration lives in the Netcup panel, not in the repo.** Passenger and every
environment variable are configured under **Node.js → Custom environment variables** (see
_Environment Variables_), so a deploy never touches them and there is no `.htaccess` to
preserve.

### Manual Deploy (emergency)

```bash
# On the server:
cd /var/www/gourmerge

# Pull the pre-built artifact (download from GitHub Actions)
tar xzf gourmerge-output-<sha>.tar.gz

# Restart Passenger
mkdir -p tmp && touch tmp/restart.txt
```

### Manual migration

Run from a machine that can reach the production MySQL, with the repo checked out at
the deployed commit:

```bash
npm ci
DATABASE_URL="mysql://user:pass@host:3306/dbname" npx drizzle-kit migrate
```

---

## Rollback Procedure

### Release layout on the host

The deploy keeps the outgoing release next to the live one — no symlinks, so the startup
file path configured in the Netcup panel (`app.js`) stays valid:

| Directory         | Meaning                                          |
| ----------------- | ------------------------------------------------ |
| `.output/`        | Live release                                     |
| `.output.prev/`   | Previous release — the rollback target           |
| `.output.new/`    | Staging dir during a deploy (should not persist) |
| `.output.failed/` | Set aside by an auto-rollback, for post-mortem   |

An auto-rollback already runs when the post-deploy smoke test fails. Roll back by hand
when a problem surfaces later:

```bash
cd /var/www/gourmerge

# Swap the current release out for the previous one
rm -rf .output.failed
mv .output .output.failed
mv .output.prev .output

mkdir -p tmp && touch tmp/restart.txt

# Verify
curl -s https://<domain>/api/health
```

> Only **one** previous release is retained, so a rollback is not repeatable — after
> rolling back, redeploy a known-good commit rather than rolling back twice. If the bad
> release included a migration, restore the pre-migration dump first (below); migrations
> are forward-only and are **not** reverted by a code rollback.

### Database Rollback

Migrations are forward-only. For destructive rollbacks:

1. Restore the latest pre-migration dump:

```bash
mysql -u <user> -p <dbname> < /backups/gourmerge-<date>.sql.gz | zcat
```

2. Then rollback the release artifact as above.

---

## Database Backups

### Plesk's Backup Manager cannot be used on this plan

It refuses to schedule anything without remote storage — _"Only the remote storages are
allowed for backups but their settings are not specified"_ — and the only remote type it
offers is **FTP**, which needs a second webspace. Until storage is added, the panel
produces no backups at all, scheduled or manual.

**Adding remote storage is still the best fix** if a cheap netcup storage product or a
second FTP target is available: Plesk then handles the schedule, rotation and restore
itself, and the data stays with a German provider. Check
**Backup Manager → Remote Storage Settings**.

### Nightly, on the host — `scripts/server-backup.sh`

`mysqldump` **is** available on the host, so a Plesk **"Run a command"** scheduled task can
dump the database directly. (This does not contradict the maintenance sweeps running over
HTTP: those need `scripts/`, `package.json` and the app's injected environment, none of
which exist on the host. `mysqldump` needs only itself and a credentials file.)

Install once over SSH — full instructions are in the script's header:

1. Write `/gourmerge.de/.my.cnf` with `[client]` host/user/password, then `chmod 600`. The
   password must **never** be in the Plesk task or on a command line; process lists are
   readable by other users on shared hosting.
2. Upload `scripts/server-backup.sh` to `/gourmerge.de/` (File Manager or SFTP — the
   deploy does not ship `scripts/`), `chmod +x`.
3. Plesk → **Scheduled Tasks → Add Task** → type **Run a command** → command
   `/bin/sh /gourmerge.de/server-backup.sh` → **daily at 03:15** (before the 04:30/04:45
   sweeps).

Before scheduling, confirm the host has what it needs:
`command -v mysqldump gzip find date`. If `gzip` is absent, set `NO_GZIP=1` in the script —
dumps stay uncompressed but valid. If `find` is absent, rotation is skipped with a warning
instead of failing.

> **The host's `mysqldump` is MariaDB's, against a MySQL 8.4 server** — verified
> 2026-08-06: `MariaDB dump 10.19 Distrib 10.5.29-MariaDB` / `Server version 8.4.11`. That
> pairing is safe **only because this dump is data-only.** A schema dump would be the
> dangerous case: MySQL 8.4 emits collations such as `utf8mb4_0900_ai_ci` that MariaDB's
> client does not understand, and the result would not reload cleanly. With
> `--no-create-info` there is no DDL to mistranslate — just `INSERT`s.
>
> It also means option support cannot be assumed. `--set-gtid-purged` is MySQL-only and a
> hard "unknown variable" failure on MariaDB, so the script probes `mysqldump --help` and
> adds it only if advertised. Every other option it uses exists in both clients.

Because the client and server are different vendors, the restore drill below is not
optional politeness — it is the only thing that proves these dumps actually reload.

**Why the dumps cannot be downloaded.** `backups/` is a **sibling of the document root**,
not a subdirectory of it:

```text
/gourmerge.de/              ← application root (Passenger)
├── httpdocs/               ← DOCUMENT ROOT — the only thing a URL path can address
├── .output/                ← the deployed artifact
└── backups/                ← dumps live here
```

A request for `/backups/x.sql.gz` resolves to `/gourmerge.de/httpdocs/backups/x.sql.gz`,
which does not exist, and `../` is normalised away by the web server before it reaches the
filesystem — a URL simply cannot address a path above its document root. The app cannot
reach them either: Nitro serves static files only from `.output/public`, and the server
code contains **no filesystem reads at all** (verified by grep: no `readFile`,
`createReadStream`, `sendStream`, `serveStatic`, and no path built from request input).

So this is structural, not a mitigation to keep re-checking. It only stops being true if
someone repoints the document root at the application root, or adds an endpoint that reads
a request-supplied path. Both would be visible in review.

If you want the five-second confirmation after a deploy anyway:
`curl -sI https://gourmerge.de/backups/` → 404.

**A backup on the same webspace dies with the webspace**, so this covers the common cases
(bad migration, accidental deletion, app bug) but not loss of the hosting itself. Pair it
with the off-host copy below.

### Off-host — `npm run db:backup`

Pulls a compressed, verified dump to a machine you control, over the same external MySQL
access the CI runner already uses for migrations. Run it periodically, and **always before
a destructive migration**.

```bash
npm run db:backup                            # DATABASE_URL from .env (local)
DATABASE_URL="mysql://…" npm run db:backup   # production
npm run db:backup -- --keep 30               # retain 30 instead of 14
```

Writes `backups/gourmerge-<host>-<db>-<timestamp>.sql.gz` (git-ignored) and rotates older
files. It **refuses to keep a dump under 1 KB**, because the failure that actually bites is
a backup that exists and is empty — a wrong password and an empty database both produce a
perfectly valid gzip of nothing.

**Data only, no schema.** `server/database/migrations/` is the schema's source of truth, so
including `CREATE TABLE` would create a second one that drifts. `__drizzle_migrations`,
`rate_limit_hits` and `webauthn_challenges` are excluded too — the first would collide on
restore (the procedure below migrates first), the other two hold state that is meaningless
minutes later.

> **Do not dump from a GitHub Actions runner**, even though it can reach the production
> database. A dump is every user's personal data, and §"Weitergabe an Dritte" of our own
> privacy policy says data goes to no third party except Sentry and _"die Daten verbleiben
> in der EU"_. Sending dumps to GitHub would make Microsoft a processor and add a US
> transfer — that needs the policy rewritten and a legal basis first, not a workflow file.

Automate it with Windows Task Scheduler (daily, avoiding 04:30 and 04:45 when the
maintenance sweeps run). The dump contains personal data, so keep the `backups/` folder on
an encrypted volume.

### Restore drill

An untested backup is not a backup; it is a file you hope is a backup. The failure modes
are silent: an empty dump, a truncated file, a job that has been failing for weeks. And
here there is a specific reason to distrust it until proven — the dump is written by a
**MariaDB** client against a **MySQL** server, and `ingredients` carries two JSON columns.

**Status: passed 2026-08-06** against the 1.05 MB host dump, before any deploy. Counts and
`CHECKSUM TABLE` matched on all 19 non-ephemeral tables; `JSON_VALID` returned
`1192/1192/1192`; umlauts came back intact (`Nierstück`, `Käsereibutter`), so utf8mb4
survived the cross-vendor round trip.

#### The comparison tool (use this in either variant below)

```bash
CNF=/gourmerge.de/.my.cnf
DB=<your-database-name>

TABLES=$(mysql --defaults-file=$CNF -N -B -e "
SELECT table_name FROM information_schema.tables
WHERE table_schema='$DB' AND table_type='BASE TABLE'
  AND table_name <> '__drizzle_migrations' ORDER BY table_name")

fingerprint() {
  for t in $TABLES; do
    # Excluded from the dump by design, so they would differ for a non-reason.
    case "$t" in rate_limit_hits|webauthn_challenges) continue ;; esac
    printf '%-30s %-8s %s\n' "$t" \
      "$(mysql --defaults-file=$CNF -N -B -e "SELECT COUNT(*) FROM \`$DB\`.\`$t\`")" \
      "$(mysql --defaults-file=$CNF -N -B -e "CHECKSUM TABLE \`$DB\`.\`$t\`" | cut -f2)"
  done
}
```

`CHECKSUM TABLE` is what makes this a real check rather than a headcount — matching row
counts prove nothing about content.

#### Before launch: restore in place (what was actually done)

Only valid while every row is reproducible from `migrations + npm run seed:*`. It is the
better drill, because it exercises the real disaster path rather than a rehearsal of it.

1. `fingerprint > /tmp/before.txt`
2. Truncate every table **except `__drizzle_migrations`** (wrap in
   `SET FOREIGN_KEY_CHECKS=0; … =1;`), then confirm `__drizzle_migrations` still has 10 rows
3. `gunzip -c <dump>.sql.gz | mysql --defaults-file=$CNF "$DB"`
4. `fingerprint > /tmp/after.txt && diff /tmp/before.txt /tmp/after.txt`
5. Run the JSON and umlaut checks below

#### After launch: scratch database only

**Never truncate production once real users exist.** Instead:

1. Plesk → Databases → create `scratch`, assigning the existing DB user
2. `DATABASE_URL="mysql://…/<scratch-db>" npm run db:migrate` — from a workstation;
   `drizzle-kit` does not exist on the host
3. `gunzip -c <dump>.sql.gz | mysql --defaults-file=$CNF <scratch-db>`
4. Compare with `fingerprint` pointed at each database in turn
5. **Drop the scratch database** — it is a full copy of everyone's personal data

#### The checks that catch a cross-vendor fault

```bash
# All three numbers must be equal.
mysql --defaults-file=$CNF -N -B -e "
SELECT COUNT(*), SUM(JSON_VALID(name_translations)), SUM(JSON_VALID(synonyms))
FROM \`$DB\`.ingredients"

# Must print real umlauts. 'RÃ¼ebli' means utf8mb4 broke and the dump is worthless.
mysql --defaults-file=$CNF -N -B -e "
SELECT name_translations->>'\$.de' FROM \`$DB\`.ingredients
WHERE name_translations->>'\$.de' REGEXP '[äöüÄÖÜß]' LIMIT 5"
```

Repeat quarterly, and again before any migration that drops or rewrites a column. This
matters more here than usual: **migrations are forward-only.** There is no down migration,
and a code rollback restores old code against the _new_ schema — so for a destructive
migration, the backup is the only way back.

#### Expected seed baseline

After `db:migrate` + the three seeds, a clean production database holds
**1192 ingredients** (1191 Swiss BLV + 1 curated `Vanillezucker`), **1191
ingredient_nutrition**, **12 tags** and **1 user** (`ghost`). A dev database will show more
ingredients — E2E runs leave behind fixtures like `Butter 1785947886683` — so compare
against these numbers, not against local.

---

## Scheduled maintenance (required — the privacy policy promises it)

Two nightly jobs, both **triggered over HTTP** rather than run as shell commands:

| Job               | URL                        | What it does                                           |
| ----------------- | -------------------------- | ------------------------------------------------------ |
| Retention cleanup | `/tasks/retention`         | Enforces the windows named in §7 of the privacy policy |
| Inactive accounts | `/tasks/inactive-accounts` | Warns, then deletes, accounts dormant for three years  |

### Why a URL and not `npm run …`

Because a shell cron **cannot work on this host**. The deploy ships only `.output/`
and `app.js`, so there is:

- no `scripts/` → `inactive-accounts.mjs` is not on the server
- no `package.json` → `npm run db:inactive` does not exist
- no `.env` → `DATABASE_URL` and the SMTP settings are **Node.js custom environment
  variables**, which Passenger injects into the _app_ process and a Plesk scheduled task
  does **not** inherit

That is the same trap as the migration step that "could never run" (current_state
§15): the host does not have what the command needs. Fetching a URL runs the job
_inside the app_, which already holds the DB pool, the mailer and the injected env.

The CLI scripts (`npm run db:cleanup`, `npm run db:inactive`) still exist and are
useful **locally**, where `.env` is present. They are not the production path.

### One-time setup

1. Generate the shared secret and add it to Plesk:

   ```bash
   openssl rand -hex 32
   ```

   Add it as `CRON_SECRET` under **Websites & Domains → gourmerge.de → Node.js →
   Custom environment variables**, alongside `DATABASE_URL` and the SMTP settings,
   then **Restart App**.

2. Verify it works before scheduling anything, using the dry run — it sends no mail
   and deletes nothing:

   ```bash
   curl -s "https://gourmerge.de/tasks/inactive-accounts?key=<CRON_SECRET>&dryRun=1"
   ```

   Expect a plain-text summary. A `503 Maintenance tasks are not configured` means
   `CRON_SECRET` did not reach the app — check step 1 and that you restarted.
   A `401` means the key does not match.

### Creating the scheduled tasks

**Plesk → Websites & Domains → Scheduled Tasks → Add Task**, twice:

| Field         | Retention cleanup                                        | Inactive accounts                                                |
| ------------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| **Task type** | **Fetch a URL**                                          | **Fetch a URL**                                                  |
| **URL**       | `https://gourmerge.de/tasks/retention?key=<CRON_SECRET>` | `https://gourmerge.de/tasks/inactive-accounts?key=<CRON_SECRET>` |
| **Run**       | Daily at `04:30`                                         | Daily at `04:45`                                                 |
| **Notify**    | Errors only                                              | Errors only                                                      |

Notes:

- **"Fetch a URL", not "Run a command"** — see above.
- Plesk's task timezone is shown on the form (Europe/Berlin). It does not need to
  match anything; both jobs are idempotent and time-of-day is only about load.
- Stagger them. Running the retention cleanup first keeps the `rate_limit_hits`
  table small before the inactivity sweep scans `users`.
- **"Errors only"** means you get an email if the job fails and silence when it
  works. "Every time" mails you the summary nightly, which is useful for the first
  week and noise after that.
- The secret sits in the task URL, which is visible to anyone with Plesk access.
  That is the same trust boundary as the environment variables themselves.

### The inactive-account job in detail

| Point in time      | What happens         |
| ------------------ | -------------------- |
| 3 years − 6 months | First warning email  |
| 3 years − 4 weeks  | Second warning email |
| 3 years − 24 hours | Final warning email  |
| 3 years            | Account hard-deleted |

**The clock is `users.last_login_at`, and only a login resets it.** A warning email
does not — otherwise the notice would keep extending the very period it warns about.
Accounts that never logged in fall back to `created_at`.

Things worth knowing before the first production run:

- **Nothing is deleted until the final notice has been sent and 24 hours have
  passed.** Without that interlock, the first run after deploy would delete every
  account older than three years the same night, with no warning at all. In practice
  the first run only _warns_; deletion starts the following night.
- **SMTP must work**, or every notice is skipped and logged as a failure. Notices are
  recorded only after a successful send, so a mail outage delays deletion rather than
  causing a silent one.
- **Deletion is a real `DELETE`**, not a flag. Attribution that lives inside other
  users' recipes (a commit copied into their fork, a GourMerge Request, a comment) is
  reassigned to the shared anonymous `ghost` account first — four FKs into `users`
  are NOT NULL + RESTRICT, so it can be neither deleted nor nulled. See
  `server/utils/hardDeleteUser.ts`.
- **The `ghost` row must exist.** Migration `0008` seeds it. It is excluded from both
  sweeps and is not loginable.

### Retention cleanup rules

| Rule                                | Window               |
| ----------------------------------- | -------------------- |
| `contact_messages`                  | 12 months            |
| `email_verification_tokens`         | used or expired      |
| `password_reset_tokens`             | used or expired      |
| `data_requests` (GDPR self-service) | completed or expired |
| `rate_limit_hits`                   | 24 hours             |

> These periods are stated in §7 of `app/pages/legal/datenschutz.vue`. Change one
> without the other and the policy becomes false. The windows live in
> `server/utils/maintenanceConfig.json` and `server/utils/retentionSweep.ts`, and
> `tests/unit/inactivityEmails.test.ts` asserts the schedule matches the documented
> one.

---

## Environment Variables

All runtime variables reach the app through **Custom environment variables** in Netcup's
panel: **Websites & Domains → gourmerge.de → Node.js → Custom environment variables →
[specify]**. The same page configures Passenger itself — application root, startup file
(`app.js`), application mode (`production`) and the Node version.

There is **no `.htaccess` on this host, and none is needed.** An earlier version of this
runbook claimed runtime configuration had to go into `PassengerEnvVar` directives because
the panel offered only a single Node.js "secret" field. That was wrong: the panel accepts
as many variables as you like. Nothing in the repo ships an `.htaccess` any more, and
adding one would be a second, weaker source of truth — there is also an nginx proxy in
front of Apache, so `.htaccess` directives are not guaranteed to be consulted at all.

Restart after any change: **Restart App** in the panel, or `touch tmp/restart.txt`.

| Variable                      | Required | Description                                                             |
| ----------------------------- | -------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`                | yes      | `mysql://user:pass@host:3306/dbname`                                    |
| `NUXT_SESSION_PASSWORD`       | yes      | ≥32-char random string for session encryption                           |
| `NUXT_PUBLIC_APP_URL`         | yes      | `https://gourmerge.de` (no trailing slash, no `www.`)                   |
| `SMTP_HOST` / `USER` / `PASS` | yes      | Netcup SMTP credentials — without all three, mail is discarded silently |
| `SMTP_FROM`                   | no       | e.g. `GourMerge <noreply@gourmerge.de>`; falls back to `SMTP_USER`      |
| `SMTP_PORT`                   | no       | Defaults to `587`                                                       |
| `NUXT_PUBLIC_SENTRY_DSN`      | no       | Sentry project DSN; unset simply disables error reporting               |
| `REQUIRE_EMAIL_VERIFICATION`  | prod     | `true` in production — gates publishing on a verified address           |
| `LOG_LEVEL`                   | no       | Defaults to `info`                                                      |
| `TOTP_ENCRYPTION_KEY`         | no       | ≥32 chars; encrypts 2FA secrets at rest                                 |
| `CRON_SECRET`                 | yes\*    | ≥16 chars; guards `/tasks/*`. \*Required for the nightly sweeps to run  |

`NODE_ENV` is set by Passenger from the panel's **Application Mode**, so it does not
belong in this list.

> **`TOTP_ENCRYPTION_KEY` and `CRON_SECRET` are runtime-only** — read per request, so
> they belong in the panel, **not** in GitHub secrets. Without `TOTP_ENCRYPTION_KEY` the
> code falls back to `NUXT_SESSION_PASSWORD`, which works but means rotating the session
> secret invalidates every enrolled authenticator at once. Without `CRON_SECRET` the
> maintenance endpoints refuse every request.

`/api/health` reports which of the required ones actually arrived — see **Health Checks**.

`NUXT_SENTRY_RELEASE` and `SENTRY_AUTH_TOKEN` are **build-time only** — GitHub
**repository** secrets, never host variables. `NUXT_SENTRY_RELEASE` is baked into the
artifact (its name does not map to the `runtimeConfig` path, so setting it under Passenger
has no effect), and the auth token only uploads source maps while CI builds. Runtime error
capture depends solely on `NUXT_PUBLIC_SENTRY_DSN`, so an absent token costs you readable
stack traces and nothing else. Use an **organization** token with scope `org:ci` — see
`docs/SECRETS.md` §2b.

---

## Canonical host — `gourmerge.de`, never `www.`

Three separate things key off the request's hostname, so one name has to win:

- **The WebAuthn RP ID is the request hostname.** `gourmerge.de` and `www.gourmerge.de`
  are different relying parties; a passkey enrolled on one does not exist on the other.
- **The CSRF check** compares the request origin against `NUXT_PUBLIC_APP_URL`, so every
  mutation on the other host returns 403.
- **`/api/health` returns 503** on the other host, for the same reason.

The apex wins, because that is what `NUXT_PUBLIC_APP_URL` is set to.

**Handled in the app**, by `server/middleware/canonical-host.ts` — so it ships with the
artifact and needs no manual step after a deploy. `www.` is stripped and the visitor is
sent to `https://<apex>` with the path and query intact: 301 for GET/HEAD, 308 for
everything else so a form POST keeps its method and body. `/.well-known/` is never
redirected, so ACME validation cannot be broken by it.

Only a leading `www.` is stripped, on purpose. Redirecting _any_ host that disagrees with
`NUXT_PUBLIC_APP_URL` would loop forever if that variable were itself wrong; this rule
cannot loop, because its target never matches the pattern that triggered it. Every other
host mismatch is surfaced loudly by `/api/health` (503) instead of being papered over.

HTTPS is **not** forced by the app: the host already answers `http://` on both names with
a 301 to `https://`. Adding a second scheme-based redirect behind the nginx proxy is how
redirect loops are made.

State verified 2026-08-06: both names resolve to the same address, `http` → `https` 301s
on both, and the Let's Encrypt certificate is a **wildcard** (`*.gourmerge.de` +
`gourmerge.de`) that validates for `www` — so the redirect is reachable rather than dying
in a TLS error, which matters because the app sends HSTS with `includeSubDomains` and a
browser would not let a visitor click past a certificate warning.

**Point the scheduled tasks at the apex.** A `www` URL gets a 301, and Plesk's
"Fetch a URL" cannot be relied on to follow one — the job would simply never run.

---

## Health Checks

- **Endpoint:** `GET /api/health`
- **Healthy:** `200` with `{ "status": "ok", "database": "connected" }`
- **UptimeRobot:** configure HTTP monitor at `https://gourmerge.de/api/health`, interval 5 min, alert on 2 consecutive failures

The endpoint reports **fitness to serve, not just liveness**, because it is what the
deploy smoke test and the auto-rollback key off. It returns **503** when the app is up
but not fit to answer requests, listing the environment variable at fault under
`problems`:

| `problems` entry                                         | What is broken                                                                                                                                                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                           | The pool cannot reach MySQL. Nothing works                                                                                                                                                                                        |
| `NUXT_PUBLIC_APP_URL (does not match the host …)`        | Unset or wrong, so it is still `http://localhost:3000`. **Every browser mutation returns 403** (the CSRF check compares the request origin against it) and every verification, reset and GDPR link mailed out points at localhost |
| `NUXT_PUBLIC_APP_URL (not a valid URL)`                  | Typo — a missing scheme, or a trailing slash issue                                                                                                                                                                                |
| `NUXT_SESSION_PASSWORD (missing or under 32 characters)` | Sessions and the pending-2FA cookie both fail mid-login                                                                                                                                                                           |

A 503 here fails the smoke test, which rolls the release back automatically — that is
the intended behaviour. Fix the variable under **Node.js → Custom environment
variables**, **Restart App**, and redeploy.

Non-fatal degradations return **200** with a `warnings` array instead, since a rollback
loop would be worse than the degradation: unset `SMTP_*` (mail is discarded, not
delivered — registration verification silently goes nowhere), unset
`TOTP_ENCRYPTION_KEY` (falls back to the session secret), unset `CRON_SECRET`
(`/tasks/*` refuse every request, so neither nightly sweep runs).

> **Check the body, not just the status, after the first deploy.** A green smoke test
> with three warnings means the site serves but cannot send email or run its retention
> jobs — and the privacy policy promises both.

---

## Incident Response

### App returns 500

1. Check Pino logs: `tail -100 /var/www/gourmerge/current/logs/app.log`
2. Check Sentry for the error + stack trace
3. If DB-related: verify `DATABASE_URL` and test `mysql -u ...`
4. If code bug: rollback to previous release (see above)

### DB connection exhausted

1. Check `connectionLimit` in `server/utils/drizzle.ts` (should be 4 per process)
2. Count Passenger processes: `ps aux | grep node`
3. Lower the app's process count in the Netcup **Node.js** panel if needed

### Passenger not restarting

```bash
# Force restart
touch /var/www/gourmerge/current/tmp/restart.txt

# Or if node process is stuck:
ps aux | grep node
kill <pid>
```

### Rate limit table growing too large

```sql
-- Remove old buckets (safe to run any time)
DELETE FROM rate_limit_hits WHERE window_start < UNIX_TIMESTAMP() - 3600;
```
