/**
 * Warn, then delete, accounts dormant for three years.
 *
 * The **production path** for this job. It lives inside the Nitro bundle because
 * the deploy ships only `.output/` and `app.js` — there is no `scripts/`, no
 * `package.json` and no `.env` on the host, so a Plesk "Run a command" cron could
 * not reach `scripts/inactive-accounts.mjs` or find a `DATABASE_URL`. Running it in
 * the app process instead gives it the existing pool, the Passenger-injected
 * environment, and the same `hardDeleteUser` the self-service erasure uses.
 *
 * `scripts/inactive-accounts.mjs` stays for local and manual runs; both read their
 * schedule from `maintenanceConfig.json`, so the two cannot drift.
 *
 * ## The rules, and why
 *
 * - The clock is `users.last_login_at` — **only a login resets it.** A warning email
 *   deliberately does not, or the notice would keep extending the very period it
 *   warns about. Accounts that never logged in fall back to `created_at`.
 * - One email per account per run: the most urgent stage not yet sent. Notice
 *   windows are unbounded above, or an account crossing the three-year line
 *   mid-cycle would fall between the windows — too late for a notice, and blocked
 *   from deletion for lacking one. That stalls forever.
 * - The final notice is **terminal**: no earlier-stage mail may follow it.
 * - Nothing is deleted until the final notice is at least 24 h old. Without that
 *   interlock the first run after deploy would delete every long-dormant account the
 *   same night, unwarned.
 * - Notices are recorded only after a successful send, so an SMTP outage delays
 *   deletion rather than causing a silent one.
 */
import { sql } from 'drizzle-orm'
import config from './maintenanceConfig.json'

const { retentionDays, notices, minHoursAfterFinalNotice } = config.inactivity

/** Last login, or the creation date for someone who registered and never returned. */
const LAST_SEEN = 'COALESCE(u.last_login_at, u.created_at)'

interface Candidate {
  id: number
  email: string
  username: string
  locale: string | null
  last_seen: string
  inactivity_notice_6m_at: string | null
  inactivity_notice_4w_at: string | null
  inactivity_notice_24h_at: string | null
}

export interface InactivityResult {
  noticesSent: number
  deleted: number
  failures: number
  /** Populated when `dryRun` is set — what *would* have happened. */
  planned: string[]
}

export async function runInactivitySweep(opts: { dryRun?: boolean } = {}): Promise<InactivityResult> {
  const dryRun = opts.dryRun === true
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const appUrl = (useRuntimeConfig().public.appUrl as string) || 'https://gourmerge.de'
  const loginUrl = `${appUrl.replace(/\/$/, '')}/auth/login`

  const result: InactivityResult = { noticesSent: 0, deleted: 0, failures: 0, planned: [] }

  /**
   * Refuse to run without a real mail transport.
   *
   * `sendMail()` falls back to a `streamTransport` when SMTP credentials are absent,
   * which **succeeds** while delivering nothing (deliberate, so local dev is not
   * blocked). For this job that failure mode is silent data loss: the notice column
   * would be stamped, and 24 hours later the account hard-deleted having never been
   * warned. A missing environment variable must not be able to cause that.
   *
   * Throwing here means Plesk's "Errors only" notification fires and nothing is
   * touched. A dry run is still allowed — it neither mails nor deletes.
   */
  if (!dryRun && !isMailConfigured()) {
    logger.error('inactivity sweep refused: SMTP is not configured')
    throw createError({
      statusCode: 503,
      statusMessage:
        'Refusing to run: SMTP is not configured, so warning emails cannot be delivered and accounts would be deleted unwarned.',
    })
  }

  // ── 1. Notices ───────────────────────────────────────────────
  const firstThreshold = retentionDays - notices[0]!.daysBefore
  const candidates = (await db.execute(
    sql.raw(`SELECT u.id, u.email, u.username, u.preferred_locale AS locale, ${LAST_SEEN} AS last_seen,
                    u.inactivity_notice_6m_at, u.inactivity_notice_4w_at, u.inactivity_notice_24h_at
               FROM users u
              WHERE u.is_ghost = 0
                AND ${LAST_SEEN} <= (NOW() - INTERVAL ${firstThreshold} DAY)`)
  )) as unknown as Candidate[][]

  for (const row of candidates[0] ?? []) {
    // The final notice is terminal — see the header.
    if (row.inactivity_notice_24h_at !== null) continue

    const ageDays = (Date.now() - new Date(row.last_seen).getTime()) / 86_400_000
    const due = [...notices]
      .reverse()
      .find((n) => ageDays >= retentionDays - n.daysBefore && row[n.column as keyof Candidate] === null)
    if (!due) continue

    const deletionDate = new Date(new Date(row.last_seen).getTime() + retentionDays * 86_400_000)

    if (dryRun) {
      result.planned.push(`notice:${due.key} → user ${row.id} (due ${deletionDate.toISOString().slice(0, 10)})`)
      result.noticesSent++
      continue
    }

    try {
      const mail = buildInactivityEmail(row.locale, due.key as never, loginUrl, deletionDate)
      await sendMail({ to: row.email, subject: mail.subject, text: mail.text, html: mail.html })
      await db.execute(sql.raw(`UPDATE users SET ${due.column} = NOW() WHERE id = ${row.id}`))
      result.noticesSent++
      logger.info('inactivity notice sent', { userId: row.id, stage: due.key })
    } catch (err) {
      result.failures++
      logger.error('inactivity notice failed', { userId: row.id, stage: due.key, err: String(err) })
    }
  }

  // ── 2. Deletions ─────────────────────────────────────────────
  const due = (await db.execute(
    sql.raw(`SELECT u.id, ${LAST_SEEN} AS last_seen
               FROM users u
              WHERE u.is_ghost = 0
                AND ${LAST_SEEN} <= (NOW() - INTERVAL ${retentionDays} DAY)
                AND u.inactivity_notice_24h_at IS NOT NULL
                AND u.inactivity_notice_24h_at <= (NOW() - INTERVAL ${minHoursAfterFinalNotice} HOUR)`)
  )) as unknown as Array<{ id: number; last_seen: string }>[]

  for (const row of due[0] ?? []) {
    if (dryRun) {
      result.planned.push(`delete → user ${row.id} (inactive since ${String(row.last_seen).slice(0, 10)})`)
      result.deleted++
      continue
    }

    try {
      // The nightly job always deletes owned recipes: nobody is there to ask, and
      // keeping a dormant stranger's content is not what "delete my account" means.
      await hardDeleteUser(db, row.id, true)
      result.deleted++
      // No email address in the log line: the point was to erase it.
      logger.info('inactive account deleted', { userId: row.id })
    } catch (err) {
      result.failures++
      logger.error('inactive account deletion failed', { userId: row.id, err: String(err) })
    }
  }

  return result
}
