/**
 * Enforce the retention windows named in section 7 of the privacy policy.
 *
 * Lives here — inside the Nitro bundle — rather than only in
 * `scripts/cleanup-retention.mjs`, because **the deploy ships only `.output/` and
 * `app.js`**. There is no `scripts/`, no `package.json` and no `.env` on the host,
 * so a Plesk "Run a command" cron calling `npm run db:cleanup` could never work.
 * Triggering it over HTTP instead means the job runs in the app process, which
 * already has the database pool and the Passenger-injected environment.
 *
 * The CLI script remains for local and manual use, where `.env` exists.
 *
 * Idempotent: every rule is a bounded DELETE, safe to run repeatedly.
 */
import { sql } from 'drizzle-orm'

export interface SweepRule {
  label: string
  /** Bounded DELETE. Written as raw SQL so it reads identically to the policy line. */
  statement: string
}

/**
 * Each rule mirrors a line in the privacy policy. Change a window here and section
 * 7 of `datenschutz.vue` has to change with it — they are two statements of the
 * same fact.
 */
export const RETENTION_RULES: SweepRule[] = [
  {
    label: 'contact_messages older than 12 months',
    statement: 'DELETE FROM contact_messages WHERE created_at < (NOW() - INTERVAL 12 MONTH)',
  },
  {
    label: 'used or expired email-verification tokens',
    statement: 'DELETE FROM email_verification_tokens WHERE used_at IS NOT NULL OR expires_at < NOW()',
  },
  {
    label: 'used or expired password-reset tokens',
    statement: 'DELETE FROM password_reset_tokens WHERE used_at IS NOT NULL OR expires_at < NOW()',
  },
  {
    label: 'completed or expired GDPR data requests',
    statement: 'DELETE FROM data_requests WHERE completed_at IS NOT NULL OR expires_at < NOW()',
  },
  {
    // Not personal data in the usual sense, but it is IP-derived and the table is
    // write-heavy.
    label: 'rate-limit buckets older than 24h',
    statement: 'DELETE FROM rate_limit_hits WHERE window_start < (UNIX_TIMESTAMP() - 86400)',
  },
  {
    // Belt and braces: `storeWebauthnChallenge` already sweeps expired rows on every
    // write, so this only matters if nobody has attempted a passkey ceremony in a
    // while and a few stale rows are sitting there.
    label: 'expired WebAuthn challenges',
    statement: 'DELETE FROM webauthn_challenges WHERE expires_at < NOW()',
  },
]

export interface RetentionResult {
  deleted: Record<string, number>
  total: number
}

export async function runRetentionSweep(): Promise<RetentionResult> {
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const deleted: Record<string, number> = {}
  let total = 0

  for (const rule of RETENTION_RULES) {
    const res = await db.execute(sql.raw(rule.statement))
    // mysql2's result header shape varies by driver path; these counts are for the
    // audit log, never for control flow, so read defensively.
    const n = Array.isArray(res)
      ? ((res[0] as { affectedRows?: number })?.affectedRows ?? 0)
      : ((res as { affectedRows?: number })?.affectedRows ?? 0)
    deleted[rule.label] = n
    total += n
  }

  logger.info('retention sweep complete', { total, deleted })
  return { deleted, total }
}
