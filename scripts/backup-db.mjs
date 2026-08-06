/**
 * npm run db:backup — take a compressed, verified dump of a GourMerge database.
 *
 * ## Why this exists
 *
 * Plesk's Backup Manager on this plan **refuses to schedule anything** without remote
 * storage ("Only the remote storages are allowed for backups"), and the only remote type
 * it offers is FTP — which needs a second webspace we do not have. So the panel cannot
 * produce an automated backup at all until storage is added.
 *
 * The obvious workaround — dump from a GitHub Actions runner, which already reaches the
 * production MySQL for migrations — is **ruled out by our own privacy policy**, which
 * states that data goes to no third party except Sentry and "die Daten verbleiben in der
 * EU". A full dump is every user's personal data; shipping it to GitHub would make
 * Microsoft a processor and a US transfer, and would need the policy rewritten first.
 *
 * So the dump is pulled to a machine we control, over the same external MySQL access the
 * runner uses. Free, off-host, and no new processor.
 *
 * ## What it does NOT contain, on purpose
 *
 * `--no-create-info`: **data only, no schema.** The schema's source of truth is
 * `server/database/migrations/`, so including `CREATE TABLE` would add a second one that
 * drifts. Restoring is: create the database, `npm run db:migrate`, then load this file.
 *
 * ## Usage
 *
 *   npm run db:backup                      # uses DATABASE_URL from .env (your local DB)
 *   DATABASE_URL="mysql://…" npm run db:backup     # production
 *   npm run db:backup -- --keep 30         # retain 30 files instead of 14
 *
 * Output: `backups/gourmerge-<host>-<db>-YYYY-MM-DD-HHmm.sql.gz` (git-ignored).
 * The filename carries the host and database because a backup you cannot identify is a
 * backup you will not trust when it matters.
 */
import { spawn } from 'node:child_process'
import { createGzip } from 'node:zlib'
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

function loadEnv() {
  try {
    for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* rely on environment */
  }
}
loadEnv()

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set (put it in .env, or pass it inline).')
  process.exit(1)
}

const keepIdx = process.argv.indexOf('--keep')
const KEEP = keepIdx >= 0 ? Math.max(1, parseInt(process.argv[keepIdx + 1] ?? '14', 10)) : 14

const url = new URL(process.env.DATABASE_URL)
const db = url.pathname.replace(/^\//, '')
if (!db) {
  console.error('ERROR: DATABASE_URL has no database name.')
  process.exit(1)
}

/**
 * Find mysqldump. Not on PATH in a default Windows MySQL install, and guessing wrong
 * produces a confusing ENOENT — so the candidates are explicit and `MYSQLDUMP` wins.
 * Prefer 8.4 to match the server: an older client can fail against a newer server.
 */
function findMysqldump() {
  if (process.env.MYSQLDUMP) return process.env.MYSQLDUMP
  const candidates = [
    'C:/Program Files/MySQL/MySQL Server 8.4/bin/mysqldump.exe',
    'C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqldump.exe',
    '/usr/bin/mysqldump',
    '/usr/local/bin/mysqldump',
  ]
  return candidates.find((c) => existsSync(c)) ?? 'mysqldump'
}

const BIN = findMysqldump()
const OUT_DIR = resolve(ROOT, 'backups')
mkdirSync(OUT_DIR, { recursive: true })

const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
const outFile = join(OUT_DIR, `gourmerge-${url.hostname}-${db}-${stamp}.sql.gz`)

const args = [
  `--host=${url.hostname}`,
  `--port=${url.port || '3306'}`,
  `--user=${decodeURIComponent(url.username)}`,
  '--single-transaction', // consistent snapshot without locking the live site
  '--quick', // stream rows instead of buffering the whole table
  '--no-create-info', // data only — migrations own the schema
  '--complete-insert', // survives a later column reorder
  '--default-character-set=utf8mb4',
  '--no-tablespaces', // shared hosting users lack the PROCESS privilege this needs
  '--skip-add-locks',
  '--set-gtid-purged=OFF',

  /**
   * `__drizzle_migrations` is excluded because the restore procedure runs
   * `db:migrate` first, which writes it — including it here means loading the dump
   * fails on a duplicate key, right when you least want a surprise.
   *
   * The other two hold state that is meaningless minutes later: rate-limiter hits and
   * 5-minute WebAuthn challenges. Restoring them would only re-apply stale throttling.
   */
  `--ignore-table=${db}.__drizzle_migrations`,
  `--ignore-table=${db}.rate_limit_hits`,
  `--ignore-table=${db}.webauthn_challenges`,

  db,
]

console.log(`Dumping ${db} @ ${url.hostname} → ${outFile.replace(ROOT + '\\', '').replace(ROOT + '/', '')}`)
console.log(`Using ${BIN}`)

// Password via the environment, never argv: process lists are world-readable.
let child
try {
  child = spawn(BIN, args, {
    env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
} catch (err) {
  // Node throws synchronously for some unspawnable targets — notably EINVAL for a .cmd
  // or .bat on Windows without `shell: true`. Without this, an operator who points
  // MYSQLDUMP at a wrapper script gets a raw stack trace instead of the actual problem.
  console.error(`ERROR: could not run ${BIN} — ${err.code ?? err.message}`)
  console.error('MYSQLDUMP must point at the mysqldump executable itself, not a .cmd/.bat wrapper.')
  process.exit(1)
}

let stderr = ''
child.stderr.on('data', (c) => {
  stderr += c.toString()
})

/**
 * Subscribe to `close` and `error` NOW, before awaiting the pipeline. Attaching the
 * listener afterwards is a race the short path always loses: mysqldump can exit before
 * the gzip stream finishes, the event fires with nobody listening, and the await never
 * settles — Node then exits silently with "unsettled top-level await" and no backup.
 */
const exited = new Promise((res) => {
  child.on('error', (err) => res(err.code === 'ENOENT' ? 'ENOENT' : 1))
  child.on('close', res)
})

/**
 * Inspect the stream on its way past, so the dump can be judged on what mysqldump
 * actually produced rather than on how well gzip compressed it. Checking the compressed
 * size is meaningless: SQL compresses 20:1 or better, so a healthy dump and an empty one
 * are both "small" — a 500-row fixture gzipped to 542 bytes while testing, which any
 * plausible byte floor would have rejected.
 */
let rawBytes = 0
let sawInsert = false
let carry = ''
const inspect = new Transform({
  transform(chunk, _enc, cb) {
    rawBytes += chunk.length
    if (!sawInsert) {
      // latin1 keeps this byte-exact; the needle is ASCII. The carry covers the case
      // where the phrase straddles a chunk boundary.
      const text = carry + chunk.toString('latin1')
      if (text.includes('INSERT INTO')) sawInsert = true
      else carry = text.slice(-16)
    }
    cb(null, chunk)
  },
})

try {
  await pipeline(child.stdout, inspect, createGzip({ level: 9 }), createWriteStream(outFile))
} catch (err) {
  console.error(`ERROR: writing the dump failed — ${err.message}`)
  process.exit(1)
}

const code = await exited

// mysqldump warns about password on stdin etc.; only a non-zero exit is fatal.
const noise = stderr.replace(/^.*\[Warning\].*$/gm, '').trim()
if (code !== 0) {
  if (code === 'ENOENT') {
    console.error(`ERROR: mysqldump was not found at ${BIN}`)
    console.error('Set MYSQLDUMP=/full/path/to/mysqldump(.exe) and try again.')
  } else {
    console.error(`ERROR: mysqldump exited ${code}`)
  }
  if (noise) console.error(noise)
  try {
    unlinkSync(outFile)
  } catch {
    /* nothing to clean up */
  }
  process.exit(1)
}
if (noise) console.warn(noise)

/**
 * Verify, because the failure mode that actually bites is a backup that exists and is
 * empty. An authentication failure or a wrong database name both yield a valid gzip of
 * comments and SET statements, and nobody notices until a restore is needed.
 *
 * Both checks are on the pre-compression stream: a byte floor, and the presence of real
 * INSERT statements — which is the check that actually means "there is data in here".
 */
if (rawBytes < 4096) {
  console.error(`ERROR: the dump is only ${rawBytes} bytes — refusing to keep an empty backup.`)
  unlinkSync(outFile)
  process.exit(1)
}
if (!sawInsert) {
  console.error('ERROR: the dump contains no INSERT statements — wrong database, or no data.')
  unlinkSync(outFile)
  process.exit(1)
}

const size = statSync(outFile).size
console.log(`✓ ${(size / 1024 / 1024).toFixed(2)} MB compressed (${(rawBytes / 1024 / 1024).toFixed(2)} MB raw)`)

// ── Rotation ────────────────────────────────────────────────
const mine = readdirSync(OUT_DIR)
  .filter((f) => f.startsWith(`gourmerge-${url.hostname}-${db}-`) && f.endsWith('.sql.gz'))
  .sort()
  .reverse()

for (const stale of mine.slice(KEEP)) {
  unlinkSync(join(OUT_DIR, stale))
  console.log(`  removed old backup ${stale}`)
}
console.log(`Retaining ${Math.min(mine.length, KEEP)} of ${mine.length} backup(s) for this database.`)

console.log('')
console.log('To restore into a scratch database (never straight into production):')
console.log('  1. create an empty database')
console.log('  2. DATABASE_URL="mysql://…/scratch" npm run db:migrate')
console.log(`  3. gunzip < "${outFile}" | mysql -h … -u … -p scratch`)
