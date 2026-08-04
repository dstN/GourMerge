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
   - Rsyncs the artifact to `.output.new/` on the host (live `.output/` untouched)
   - Renames `.output` → `.output.prev`, then `.output.new` → `.output`, and touches
     `tmp/restart.txt`
4. Smoke test polls `https://<domain>/api/health` (6 × 10 s). On failure the deploy
   **auto-rolls back** to `.output.prev`

> **Migrations run from the CI runner, not over SSH.** The Netcup webspace has neither
> `drizzle-kit` nor the migration SQL (only `.output/` + `app.js` are shipped), so the
> production MySQL must accept connections from GitHub Actions. If the DB is firewalled
> to the webspace only, see _Manual migration_ below and drop the migrate step from
> `deploy.yml`.

> **`.htaccess` is deliberately never deployed.** It holds host-specific
> `PassengerNodejs` / `PassengerEnvVar` values (see `docs/SECRETS.md`); overwriting it
> would wipe the injected environment. Update it by hand when it changes in git.

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

The deploy keeps the outgoing release next to the live one — no symlinks, so Passenger's
`PassengerStartupFile app.js` path stays valid:

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

### Scheduled backup (Netcup cron)

Add to Netcup's cron manager:

```
0 3 * * *  mysqldump -u <user> -p<pass> <dbname> | gzip > /backups/gourmerge-$(date +%F).sql.gz
```

Retain 14 days:

```
0 4 * * *  find /backups -name 'gourmerge-*.sql.gz' -mtime +14 -delete
```

### Verify restore (run quarterly)

```bash
mysql -u <user> -p -e "CREATE DATABASE gourmerge_restore;"
zcat /backups/gourmerge-<date>.sql.gz | mysql -u <user> -p gourmerge_restore
mysql -u <user> -p gourmerge_restore -e "SELECT COUNT(*) FROM users;"
mysql -u <user> -p -e "DROP DATABASE gourmerge_restore;"
```

---

## Environment Variables

Set via Passenger `.htaccess` directives or Netcup hosting panel:

| Variable                                | Description                                   |
| --------------------------------------- | --------------------------------------------- |
| `DATABASE_URL`                          | `mysql://user:pass@host:3306/dbname`          |
| `NUXT_SESSION_PASSWORD`                 | ≥32-char random string for session encryption |
| `NUXT_PUBLIC_APP_URL`                   | `https://gourmerge.app` (no trailing slash)   |
| `NUXT_PUBLIC_SENTRY_DSN`                | Sentry project DSN                            |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Netcup SMTP credentials                       |

`NUXT_SENTRY_RELEASE` and `SENTRY_AUTH_TOKEN` are **build-time only** — set in
`ci.yml`, not on the host. `NUXT_SENTRY_RELEASE` is baked into the artifact (its name
does not map to the `runtimeConfig` path, so setting it under Passenger has no effect).

---

## Health Checks

- **Endpoint:** `GET /api/health`
- **Expected response:** `{ "status": "ok", "db": "ok" }`
- **UptimeRobot:** configure HTTP monitor at `https://gourmerge.app/api/health`, interval 5 min, alert on 2 consecutive failures

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
3. Reduce `PassengerMaxPoolSize` in `.htaccess` if needed

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
