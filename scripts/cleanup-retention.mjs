/**
 * Enforce the retention periods stated in the privacy policy.
 *
 * The policy names concrete windows (Art. 13(2)(a) GDPR requires it), so those
 * windows have to actually happen — a documented period nobody enforces is
 * worse than none, because it is a claim you cannot back up. Before this script
 * existed, `contact_messages` and `rate_limit_hits` had no delete path anywhere
 * in the codebase and simply grew forever.
 *
 * Idempotent and safe to run repeatedly. Intended as a nightly cron:
 *
 *   30 4 * * *  cd /gourmerge.de && npm run db:cleanup >> logs/cleanup.log 2>&1
 *
 * Usage:
 *   node scripts/cleanup-retention.mjs
 *   node scripts/cleanup-retention.mjs --dry-run   (counts only, no deletes)
 */
import { createConnection } from 'mysql2/promise'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const isDryRun = process.argv.includes('--dry-run')

function loadEnv() {
  try {
    const lines = readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* rely on environment */
  }
}
loadEnv()

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.')
  process.exit(1)
}

/**
 * Each rule mirrors a line in the privacy policy. Keep them in sync: if a
 * window changes here, section 7 of datenschutz.vue has to change too.
 */
const RULES = [
  {
    label: 'contact_messages older than 12 months',
    count: 'SELECT COUNT(*) AS n FROM contact_messages WHERE created_at < (NOW() - INTERVAL 12 MONTH)',
    delete: 'DELETE FROM contact_messages WHERE created_at < (NOW() - INTERVAL 12 MONTH)',
  },
  {
    label: 'used or expired email-verification tokens',
    count: 'SELECT COUNT(*) AS n FROM email_verification_tokens WHERE used_at IS NOT NULL OR expires_at < NOW()',
    delete: 'DELETE FROM email_verification_tokens WHERE used_at IS NOT NULL OR expires_at < NOW()',
  },
  {
    label: 'used or expired password-reset tokens',
    count: 'SELECT COUNT(*) AS n FROM password_reset_tokens WHERE used_at IS NOT NULL OR expires_at < NOW()',
    delete: 'DELETE FROM password_reset_tokens WHERE used_at IS NOT NULL OR expires_at < NOW()',
  },
  {
    label: 'completed or expired GDPR data requests',
    count: 'SELECT COUNT(*) AS n FROM data_requests WHERE completed_at IS NOT NULL OR expires_at < NOW()',
    delete: 'DELETE FROM data_requests WHERE completed_at IS NOT NULL OR expires_at < NOW()',
  },
  {
    // Not personal data in the usual sense, but it is IP-derived and the table
    // is write-heavy — the runbook used to carry this as a manual SQL snippet.
    label: 'rate-limit buckets older than 24h',
    count: 'SELECT COUNT(*) AS n FROM rate_limit_hits WHERE window_start < (UNIX_TIMESTAMP() - 86400)',
    delete: 'DELETE FROM rate_limit_hits WHERE window_start < (UNIX_TIMESTAMP() - 86400)',
  },
]

async function main() {
  const conn = await createConnection(process.env.DATABASE_URL)
  let total = 0

  console.log(`GourMerge retention cleanup${isDryRun ? ' (DRY RUN)' : ''}\n`)

  try {
    for (const rule of RULES) {
      const [rows] = await conn.query(rule.count)
      const n = Number(rows[0].n)
      total += n

      if (n === 0) {
        console.log(`  ${'—'} ${rule.label}: nothing to do`)
        continue
      }
      if (isDryRun) {
        console.log(`  ~ ${rule.label}: ${n} row(s) would be deleted`)
        continue
      }
      const [res] = await conn.query(rule.delete)
      console.log(`  ✓ ${rule.label}: ${res.affectedRows} row(s) deleted`)
    }
  } finally {
    await conn.end()
  }

  console.log(`\n${isDryRun ? 'Would delete' : 'Deleted'} ${total} row(s) in total.`)
}

main().catch((err) => {
  console.error('Cleanup failed:', err.message)
  process.exit(1)
})
