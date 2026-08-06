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

> **Runtime configuration lives in the Netcup panel, not in the repo.** Passenger and
> every environment variable are configured under **Node.js → Custom environment
> variables** (see _Environment Variables_), so a deploy never touches them and there is
> no `.htaccess` to preserve.

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

### Scheduled backup (Plesk Backup Manager)

Use the panel, not a `mysqldump` cron: **Websites & Domains → Backup Manager →
Schedule**. It covers the webspace **and** the databases in one job, handles rotation
itself, and does not depend on `mysqldump` existing in the chroot.

| Setting            | Value                                                                     |
| ------------------ | ------------------------------------------------------------------------- |
| Run                | Daily, outside the nightly maintenance window (those run 04:30 and 04:45) |
| Backup type        | Full, **including databases** — a webspace-only backup restores no data   |
| Retain             | 14 days, or whatever the plan's storage allows                            |
| **Remote Storage** | Configure it if the plan offers it                                        |

> **Remote storage matters more than the schedule.** A backup stored on the same
> webspace dies with the webspace. If remote storage is unavailable, download a copy
> manually at least before any risky migration.

### Restore drill — do this once, on purpose

An untested backup is not a backup; it is a file you hope is a backup. The failure modes
are silent — an empty dump, a truncated file, a job that has been failing for weeks.

1. Take a backup from Backup Manager.
2. Restore it into a **scratch database**, not production (Databases → create one).
3. Confirm the row counts look sane: `users`, `recipes`, `recipe_commits`.
4. Drop the scratch database.

Repeat quarterly, and once more before any migration that drops or rewrites a column.
This matters more here than usual: **migrations are forward-only**. There is no down
migration, and a code rollback restores old code against the _new_ schema — so for a
destructive migration the backup is the only way back.

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

`NUXT_SENTRY_RELEASE` and `SENTRY_AUTH_TOKEN` are **build-time only** — set in
`ci.yml`, not on the host. `NUXT_SENTRY_RELEASE` is baked into the artifact (its name
does not map to the `runtimeConfig` path, so setting it under Passenger has no effect).

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
