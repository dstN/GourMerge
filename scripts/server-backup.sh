#!/bin/sh
# GourMerge — nightly database dump, run ON the Netcup host.
#
# Plesk's Backup Manager cannot be scheduled on this plan (it demands remote storage and
# only offers FTP), but `mysqldump` exists on the host, so a Plesk **"Run a command"**
# scheduled task can do the job directly. That does not contradict the maintenance
# sweeps running over HTTP instead of cron: those need `scripts/`, `package.json` and the
# app's injected environment, none of which exist on the host. This script needs only
# mysqldump and a credentials file, so a command task suits it fine.
#
# ── Install (once, over SSH) ───────────────────────────────────────────────────
#
#   1. Credentials file, so no password ever appears in a command line or in Plesk's
#      task config (process lists are readable by other users on shared hosting):
#
#        cat > /gourmerge.de/.my.cnf <<'EOF'
#        [client]
#        host=<db-host>
#        user=<your-database-name>
#        password=YOUR_DB_PASSWORD
#        EOF
#        chmod 600 /gourmerge.de/.my.cnf
#
#   2. This script:
#        chmod +x /gourmerge.de/server-backup.sh
#
#   3. Plesk → Websites & Domains → Scheduled Tasks → Add Task
#        Task type: Run a command
#        Command:   /bin/sh /gourmerge.de/server-backup.sh
#        Schedule:  daily at 03:15   (before the 04:30/04:45 maintenance sweeps)
#
# ── Verify the host has what this needs ───────────────────────────────────────
#
#        command -v mysqldump gzip find date
#
#      If `gzip` is missing, set NO_GZIP=1 below — dumps stay uncompressed but valid.
#      If `find` is missing, rotation is skipped with a warning rather than failing.
#
# ── Two things that would make this dangerous, both handled ───────────────────
#
#   • The dump must NOT be web-reachable. It is written to $APP_ROOT/backups, which is
#     OUTSIDE the document root (httpdocs) and outside .output/public, so neither nginx
#     nor Nitro will serve it. After the first run, confirm:
#         curl -sI https://gourmerge.de/backups/   → expect 404, never a listing
#   • A backup that exists and is empty is worse than none, because it is trusted. A
#     wrong password or an empty database both yield a valid file of almost nothing, so
#     the dump is verified BEFORE compression — both its size and the presence of real
#     INSERT statements. Checking the gzip would be meaningless: repetitive SQL
#     compresses so well that a perfectly good dump can land under any byte threshold.
#
set -eu

APP_ROOT="/gourmerge.de"
DB="<your-database-name>"
OUT_DIR="$APP_ROOT/backups"
CNF="$APP_ROOT/.my.cnf"
KEEP_DAYS=14
# Uncompressed. The ingredients table alone is ~1200 rows, so a real dump is far larger;
# anything under this means the dump failed rather than "the site is quiet".
MIN_BYTES=4096
# NO_GZIP=1

log() { echo "[backup] $*"; }
die() {
  echo "[backup] ERROR: $*" >&2
  exit 1
}

[ -f "$CNF" ] || die "missing $CNF — see the install notes at the top of this script"
command -v mysqldump >/dev/null 2>&1 || die "mysqldump not found on PATH"

mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"

STAMP=$(date +%Y-%m-%d-%H%M)

# Data only. `server/database/migrations/` is the schema's source of truth, so dumping
# CREATE TABLE would add a second one that drifts. Restore = create db, run migrations,
# load this file. Kept deliberately identical to `npm run db:backup`.
#
# __drizzle_migrations is excluded because the restore procedure migrates first, so
# including it makes the load fail on a duplicate key. rate_limit_hits and
# webauthn_challenges hold state that is meaningless minutes later.
set -- \
  "--defaults-file=$CNF" \
  --single-transaction \
  --quick \
  --no-create-info \
  --complete-insert \
  --default-character-set=utf8mb4 \
  --no-tablespaces \
  --skip-add-locks \
  --set-gtid-purged=OFF \
  "--ignore-table=$DB.__drizzle_migrations" \
  "--ignore-table=$DB.rate_limit_hits" \
  "--ignore-table=$DB.webauthn_challenges" \
  "$DB"

# Dump uncompressed first. Piping straight into gzip would mean verifying the compressed
# file, and there is no honest threshold for that — SQL compresses 20:1 or better, so a
# good dump and an empty one are both "small". It also avoids needing pipefail, which
# POSIX sh does not have: a mysqldump failure piped into a successful gzip would otherwise
# look like success.
TMP="$OUT_DIR/gourmerge-$STAMP.sql.part"
mysqldump "$@" >"$TMP" || {
  rm -f "$TMP"
  die "mysqldump failed"
}

SIZE=$(wc -c <"$TMP" | tr -d ' ')
if [ "$SIZE" -lt "$MIN_BYTES" ]; then
  rm -f "$TMP"
  die "dump is only $SIZE bytes — refusing to keep an empty backup"
fi

# Size alone would still accept a file of nothing but comments and SET statements, which
# is exactly what a dump of an empty (or wrong) database looks like.
if ! grep -q 'INSERT INTO' "$TMP"; then
  rm -f "$TMP"
  die "dump contains no INSERT statements — wrong database, or no data"
fi

if [ "${NO_GZIP:-0}" = "1" ] || ! command -v gzip >/dev/null 2>&1; then
  FINAL="$OUT_DIR/gourmerge-$STAMP.sql"
  mv "$TMP" "$FINAL"
else
  FINAL="$OUT_DIR/gourmerge-$STAMP.sql.gz"
  gzip -c "$TMP" >"$FINAL.part" || {
    rm -f "$TMP" "$FINAL.part"
    die "gzip failed"
  }
  rm -f "$TMP"
  # Rename last, so an interrupted run never leaves something that looks complete.
  mv "$FINAL.part" "$FINAL"
fi

chmod 600 "$FINAL"
log "wrote $FINAL (${SIZE} bytes uncompressed)"

if command -v find >/dev/null 2>&1; then
  find "$OUT_DIR" -name 'gourmerge-*.sql*' -type f -mtime "+$KEEP_DAYS" -delete 2>/dev/null || true
  log "rotated: kept the last $KEEP_DAYS days"
else
  log "WARNING: find not available — old dumps are NOT being rotated, prune by hand"
fi

# A backup on the same webspace dies with the webspace. Pull a copy off-host regularly
# (`npm run db:backup` from a machine you control), and always before a destructive
# migration.
log "done"
