/**
 * Delete accounts that have been inactive for three years, warning first.
 *
 * ## Why
 *
 * Without a tax-relevant record to keep (GourMerge has no purchase history), there
 * is no legitimate interest in holding a dormant account's personal data
 * indefinitely. The accepted practice is to delete after 2–3 years of no contact.
 * A stated retention period that nobody enforces is worse than none — it is a claim
 * you cannot back up — so this runs nightly alongside `cleanup-retention.mjs`.
 *
 * ## The clock
 *
 * `users.last_login_at`, and only that. Not `updated_at`, which is
 * `ON UPDATE CURRENT_TIMESTAMP` and therefore moves whenever anything writes to the
 * row — a locale change or a counter touch would make an abandoned account look
 * active forever.
 *
 * Accounts that have never logged in fall back to `created_at`, so a registration
 * that was never used is not immortal.
 *
 * **Only a login resets the clock.** A warning email deliberately does not: if it
 * did, the notice would keep extending the very period it is warning about.
 * `completeLogin()` clears the three notice columns, so a returning user starts a
 * clean cycle and would be warned again from scratch.
 *
 * ## Schedule
 *
 *   3 years − 6 months  → first notice
 *   3 years − 4 weeks   → second notice
 *   3 years − 24 hours  → final notice
 *   3 years             → hard delete
 *
 * Each notice is recorded in its own column, so re-running the job never re-sends
 * one, and support can see exactly what a user was told and when. A notice that
 * fails to send is left unrecorded and retried on the next run — better a duplicate
 * warning than a silent deletion.
 *
 * ## Deletion
 *
 * Hard delete. The four RESTRICT FKs into `users` mean the row cannot simply be
 * removed, so attribution living inside *other people's* recipes is reassigned to a
 * shared anonymous `ghost` account first — the same logic as
 * `server/utils/hardDeleteUser.ts`, reimplemented here in raw SQL because this
 * script runs outside Nitro and cannot import server utils.
 *
 * ## Usage
 *
 *   node scripts/inactive-accounts.mjs             # send notices + delete
 *   node scripts/inactive-accounts.mjs --dry-run   # report only, no writes, no mail
 *
 * Nightly cron (after the retention cleanup):
 *   45 4 * * *  cd /gourmerge.de && npm run db:inactive >> logs/inactive.log 2>&1
 */
import { createConnection } from 'mysql2/promise'
import { createTransport } from 'nodemailer'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const isDryRun = process.argv.includes('--dry-run')

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
  console.error('ERROR: DATABASE_URL is not set.')
  process.exit(1)
}

const APP_URL = (process.env.NUXT_PUBLIC_APP_URL || 'https://gourmerge.de').replace(/\/$/, '')
const LOGIN_URL = `${APP_URL}/auth/login`

/**
 * Retention window and notice offsets, read from the SAME JSON the in-app sweep
 * uses (server/utils/inactivitySweep.ts), so the CLI and the production path cannot
 * drift. JSON because this script runs as plain Node with no TS pipeline.
 */
const MAINT = JSON.parse(readFileSync(resolve(ROOT, 'server/utils/maintenanceConfig.json'), 'utf8'))
const RETENTION_DAYS = MAINT.inactivity.retentionDays
const NOTICES = MAINT.inactivity.notices.map((n) => ({ ...n, stage: n.key }))

// ── Email content ────────────────────────────────────────────────
// Read from the SAME JSON the Nitro-side builder uses, so cron mail and app mail
// cannot drift. This script has no TS pipeline, which is precisely why the copy
// lives in JSON rather than in the .ts module.
const INACTIVITY_MESSAGES = JSON.parse(readFileSync(resolve(ROOT, 'server/utils/inactivityMessages.json'), 'utf8'))
const DATE_LOCALE = { de: 'de-DE', en: 'en-GB', fr: 'fr-FR', it: 'it-IT' }

function buildEmail(locale, stage, deletionDate) {
  const loc = ['de', 'en', 'fr', 'it'].includes(locale) ? locale : 'de'
  const s = INACTIVITY_MESSAGES[loc]?.[stage]
  if (!s?.subject) throw new Error(`Missing inactivity copy for ${loc}/${stage}`)
  const date = new Intl.DateTimeFormat(DATE_LOCALE[loc], {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(deletionDate)
  const intro = s.intro.replaceAll('{date}', date)
  const outro = s.outro.replaceAll('{date}', date)
  return {
    subject: s.subject,
    text: `${intro}\n\n${LOGIN_URL}\n\n${outro}`,
    html: `<p>${intro}</p>\n<p><a href="${LOGIN_URL}">${s.linkLabel}</a></p>\n<p>${outro}</p>`,
  }
}

// ── Mail transport ───────────────────────────────────────────────
let transport = null
function mailer() {
  if (transport) return transport
  if (!process.env.SMTP_HOST) return null
  transport = createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  })
  return transport
}

// ── Main ─────────────────────────────────────────────────────────
const db = await createConnection(process.env.DATABASE_URL)

/**
 * `effective_last_seen` is the clock: the last login, or the account creation date
 * for someone who registered and never came back.
 */
const LAST_SEEN = 'COALESCE(u.last_login_at, u.created_at)'

let totals = { notices: 0, deleted: 0, failures: 0 }

/**
 * Refuse to run without SMTP.
 *
 * Previously a missing transport only counted each notice as a failure — but the
 * DELETION pass ran anyway, so any account whose final notice had been recorded on
 * an earlier (working) run would still be deleted while the current run could warn
 * nobody. Worse, the in-app twin used sendMail(), which silently succeeds via a
 * stream transport when credentials are absent, stamping the notice column with
 * nothing delivered. Both paths now stop instead. A dry run is still allowed.
 */
if (!isDryRun && !(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)) {
  console.error('ERROR: SMTP is not configured. Refusing to run: warning emails could not be')
  console.error('       delivered, and accounts would be deleted without ever being warned.')
  console.error('       Use --dry-run to inspect what would happen.')
  await db.end()
  process.exit(1)
}

try {
  // ── 1. Warning notices ─────────────────────────────────────────
  // One email per account per run: the MOST URGENT stage that has not been sent
  // yet. Two reasons this is not a simple per-stage sweep:
  //
  //   * Notice windows must have no upper bound, or an account that crosses the
  //     3-year line before a notice went out falls between the windows — past the
  //     notice range, and blocked from deletion because the final notice is
  //     missing. That stalls forever. (Caught by a boundary dry-run.)
  //   * With unbounded windows, a per-stage sweep would mail an overdue account
  //     all three notices in one night. Picking the most urgent stage instead gives
  //     it the final notice, and it is deleted on the next run 24h later.
  const [candidates] = await db.execute(
    `SELECT u.id, u.email, u.username, u.preferred_locale AS locale, ${LAST_SEEN} AS last_seen,
            u.inactivity_notice_6m_at, u.inactivity_notice_4w_at, u.inactivity_notice_24h_at
       FROM users u
      WHERE u.is_ghost = 0
        AND ${LAST_SEEN} <= (NOW() - INTERVAL ? DAY)`,
    [RETENTION_DAYS - NOTICES[0].daysBefore]
  )

  for (const row of candidates) {
    // The final notice is TERMINAL. Without this, an account that has already been
    // told "you will be deleted tomorrow" would go on to receive the earlier
    // "in four weeks" notice on the next run, because that stage was never sent —
    // nonsense to read, and it would undermine the warning it follows.
    if (row.inactivity_notice_24h_at !== null) continue

    const ageDays = (Date.now() - new Date(row.last_seen).getTime()) / 86_400_000

    // Most urgent applicable stage wins, so an overdue account gets the final
    // notice rather than working through the earlier ones one night at a time.
    const due = [...NOTICES].reverse().find((n) => ageDays >= RETENTION_DAYS - n.daysBefore && row[n.column] === null)
    if (!due) continue

    const deletionDate = new Date(new Date(row.last_seen).getTime() + RETENTION_DAYS * 86_400_000)
    const mail = buildEmail(row.locale, due.stage, deletionDate)

    if (isDryRun) {
      console.log(`[dry-run] ${due.key} → ${row.username} (due ${deletionDate.toISOString().slice(0, 10)})`)
      totals.notices++
      continue
    }

    const tx = mailer()
    if (!tx) {
      console.warn(`SKIP ${due.key} for ${row.username}: SMTP is not configured`)
      totals.failures++
      continue
    }

    try {
      await tx.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: row.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      })
      // Recorded only AFTER a successful send. If the mail fails, the column stays
      // null and the next run retries — a duplicate warning is far better than a
      // deletion the user was never told about.
      await db.execute(`UPDATE users SET ${due.column} = NOW() WHERE id = ?`, [row.id])
      totals.notices++
      console.log(`sent ${due.key} → user ${row.id}`)
    } catch (err) {
      totals.failures++
      console.error(`FAILED ${due.key} for user ${row.id}:`, err.message)
    }
  }

  // ── 2. Deletions ───────────────────────────────────────────────
  // Two conditions, both required: past the retention window AND the final notice
  // went out at least 24 hours ago.
  //
  // The notice requirement is the safety interlock, not decoration. Without it the
  // first run after deploy would delete every account older than three years the
  // same night, with no warning whatsoever. With it, such an account gets the final
  // notice on one run and is deleted on the next — so there is always a real 24h
  // window in which logging in saves it.
  const [due] = await db.execute(
    `SELECT u.id, u.username, ${LAST_SEEN} AS last_seen
       FROM users u
      WHERE u.is_ghost = 0
        AND ${LAST_SEEN} <= (NOW() - INTERVAL ? DAY)
        AND u.inactivity_notice_24h_at IS NOT NULL
        AND u.inactivity_notice_24h_at <= (NOW() - INTERVAL 1 DAY)`,
    [RETENTION_DAYS]
  )

  for (const row of due) {
    if (isDryRun) {
      console.log(`[dry-run] delete ${row.username} (inactive since ${String(row.last_seen).slice(0, 10)})`)
      totals.deleted++
      continue
    }

    try {
      await hardDelete(db, row.id)
      totals.deleted++
      // No email address in the log: the point was to erase it.
      console.log(`deleted inactive user ${row.id}`)
    } catch (err) {
      totals.failures++
      console.error(`FAILED delete for user ${row.id}:`, err.message)
    }
  }

  console.log(
    `${isDryRun ? '[dry-run] ' : ''}done — ${totals.notices} notice(s), ${totals.deleted} deletion(s), ${totals.failures} failure(s)`
  )
} finally {
  await db.end()
}

if (totals.failures > 0) process.exitCode = 1

/**
 * Hard-delete a user, mirroring `server/utils/hardDeleteUser.ts`.
 *
 * The nightly job always deletes owned recipes: there is nobody to ask whether they
 * should stay, and keeping a dormant stranger's content attributed to a ghost is
 * not what "delete my inactive account" means.
 */
async function hardDelete(conn, userId) {
  await conn.beginTransaction()
  try {
    // Singleton ghost that inherits attribution from inside other users' recipes.
    const [[ghost]] = [await conn.execute('SELECT id FROM users WHERE is_ghost = 1 LIMIT 1')]
    let ghostId = ghost?.[0]?.id
    if (!ghostId) {
      const [ins] = await conn.execute(
        `INSERT INTO users (username, email, password_hash, is_ghost)
         VALUES ('ghost', 'ghost@gourmerge.invalid', 'ghost-account-not-loginable', 1)`
      )
      ghostId = ins.insertId
    }
    if (ghostId === userId) throw new Error('refusing to delete the ghost account')

    const [owned] = await conn.execute('SELECT id FROM recipes WHERE owner_id = ?', [userId])
    const recipeIds = owned.map((r) => r.id)

    if (recipeIds.length > 0) {
      const ph = recipeIds.map(() => '?').join(',')
      // Forks of these recipes become standalone (forked_from is NO ACTION).
      await conn.execute(
        `UPDATE recipes SET forked_from_recipe_id = NULL WHERE forked_from_recipe_id IN (${ph})`,
        recipeIds
      )

      // Cross-recipe GMRs referencing these branches block the branch cascade.
      const [branches] = await conn.execute(`SELECT id FROM recipe_branches WHERE recipe_id IN (${ph})`, recipeIds)
      if (branches.length > 0) {
        const bph = branches.map(() => '?').join(',')
        const bids = branches.map((b) => b.id)
        await conn.execute(
          `DELETE FROM gourmerge_requests WHERE source_branch_id IN (${bph}) OR target_branch_id IN (${bph})`,
          [...bids, ...bids]
        )
      }

      await conn.execute(`DELETE FROM recipes WHERE id IN (${ph})`, recipeIds)
    }

    // Whatever attribution is left lives inside OTHER users' recipes. Deleting it
    // would corrupt their history; NOT NULL rules out nulling it; so it becomes the
    // ghost's and reads as anonymous.
    await conn.execute('UPDATE recipe_commits SET author_id = ? WHERE author_id = ?', [ghostId, userId])
    await conn.execute('UPDATE gourmerge_requests SET author_id = ? WHERE author_id = ?', [ghostId, userId])
    await conn.execute('UPDATE gm_request_comments SET author_id = ? WHERE author_id = ?', [ghostId, userId])

    await conn.execute('DELETE FROM contact_messages WHERE email = (SELECT email FROM users WHERE id = ?)', [userId])

    // Stars, tokens, data requests, TOTP enrolment and recovery codes all cascade.
    await conn.execute('DELETE FROM users WHERE id = ? AND is_ghost = 0', [userId])

    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  }
}
