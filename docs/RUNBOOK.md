# GourMerge Operations Runbook

## Deploy Process

### Prerequisites
- SSH access to Netcup webspace
- GitHub repository secrets configured (see `docs/SECRETS.md`)
- Node.js available on the host (`node --version`)

### Normal Deploy (automatic via CI/CD)
1. Push to `master`
2. GitHub Actions CI runs: lint → typecheck → i18n-check → test → build
3. On CI success, deploy job:
   - Rsyncs `.output/` to Netcup
   - Runs `drizzle-kit migrate` against production DB
   - Touches `tmp/restart.txt` to restart Passenger
4. Smoke test hits `https://<domain>/api/health` — fail = deploy blocked

### Manual Deploy (emergency)
```bash
# On the server:
cd /var/www/gourmerge

# Pull the pre-built artifact (download from GitHub Actions)
tar xzf gourmerge-output-<sha>.tar.gz

# Run migrations
DATABASE_URL="$DATABASE_URL" npx drizzle-kit migrate

# Restart Passenger
mkdir -p tmp && touch tmp/restart.txt
```

---

## Rollback Procedure

### Keep N previous releases
The deploy script retains the two most recent releases in `releases/`. The `current` symlink points to the active one.

```bash
# List releases
ls -la /var/www/gourmerge/releases/

# Rollback to previous release
cd /var/www/gourmerge
ln -sfn releases/<previous-timestamp> current
touch tmp/restart.txt

# Verify
curl -s https://<domain>/api/health
```

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

| Variable | Description |
|---|---|
| `DATABASE_URL` | `mysql://user:pass@host:3306/dbname` |
| `NUXT_SESSION_PASSWORD` | ≥32-char random string for session encryption |
| `NUXT_PUBLIC_APP_URL` | `https://gourmerge.app` (no trailing slash) |
| `NUXT_PUBLIC_SENTRY_DSN` | Sentry project DSN |
| `NUXT_SENTRY_RELEASE` | Set by CI to git SHA |
| `SENTRY_AUTH_TOKEN` | For source map upload (CI only) |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Netcup SMTP credentials |

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
