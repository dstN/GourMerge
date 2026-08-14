/**
 * GET|POST /tasks/:task?key=… — trigger a maintenance job over HTTP.
 *
 * ## Why an endpoint and not a cron command
 *
 * The deploy ships **only** `.output/` and `app.js`. The host has no `scripts/`, no
 * `package.json` and no `.env`, and a Plesk scheduled task does not inherit the
 * "Custom environment variables" that Passenger injects into the app. So a
 * "Run a command" cron calling `npm run db:cleanup` fails three ways at once:
 * missing script, missing npm script, missing `DATABASE_URL`.
 *
 * Plesk's **"Fetch a URL"** task type sidesteps all three: the work happens inside
 * the running app, which already holds the database pool, the SMTP settings and the
 * injected environment. Same class of mistake as the migration step that "could
 * never run" (see current_state §15) — the host does not have what the command needs.
 *
 * ## Auth
 *
 * A shared secret in `CRON_SECRET`, compared in constant time. Deliberately **not**
 * a session: cron has no user. If the variable is unset the endpoint refuses every
 * request rather than running unauthenticated — a publicly reachable URL that
 * deletes accounts would be catastrophic, so failing closed is the only option.
 *
 * `GET` is accepted because Plesk's "Fetch a URL" issues a GET. That makes this a
 * state-changing GET, which is normally wrong — the secret is what makes it safe,
 * and there is no browser session for CSRF to ride on.
 *
 * ## Usage
 *
 *   https://gourmerge.de/tasks/retention?key=…
 *   https://gourmerge.de/tasks/inactive-accounts?key=…
 *   https://gourmerge.de/tasks/inactive-accounts?key=…&dryRun=1
 *   https://gourmerge.de/tasks/notification-digest?key=…
 */
import { timingSafeEqual } from 'node:crypto'

const TASKS = ['retention', 'inactive-accounts', 'notification-digest'] as const
type TaskName = (typeof TASKS)[number]

function authorize(event: Parameters<typeof getQuery>[0]): void {
  const expected = process.env.CRON_SECRET
  if (!expected || expected.length < 16) {
    // Fail closed. An unset secret must never mean "open to everyone".
    logger.error('task endpoint called but CRON_SECRET is not configured')
    throw createError({ statusCode: 503, statusMessage: 'Maintenance tasks are not configured.' })
  }

  const query = getQuery(event)
  const provided = String(query.key ?? getHeader(event, 'x-cron-key') ?? '')

  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  // Length check first: timingSafeEqual throws on a mismatch, and comparing
  // lengths separately leaks only the length, which the caller already controls.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    logger.warn('task endpoint rejected a bad key', { path: event.path })
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
}

export default defineEventHandler(async (event) => {
  authorize(event)

  const task = getRouterParam(event, 'task') as TaskName | undefined
  if (!task || !TASKS.includes(task)) {
    throw createError({ statusCode: 404, statusMessage: `Unknown task. Known: ${TASKS.join(', ')}` })
  }

  const dryRun = ['1', 'true', 'yes'].includes(String(getQuery(event).dryRun ?? ''))
  const startedAt = Date.now()

  logger.info('maintenance task started', { task, dryRun })

  const result =
    task === 'retention'
      ? // Retention has no dry-run path: every rule is a bounded DELETE of rows the
        // policy already promises to remove, so there is nothing to preview.
        await runRetentionSweep()
      : task === 'inactive-accounts'
        ? await runInactivitySweep({ dryRun })
        : await runNotificationDigest({ dryRun })

  const durationMs = Date.now() - startedAt
  logger.info('maintenance task finished', { task, dryRun, durationMs })

  // Plain-text body: Plesk emails the response when "Notify" is enabled, and a
  // human reading that mail wants a summary, not JSON.
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  return [
    `task: ${task}${dryRun ? ' (dry run)' : ''}`,
    `duration: ${durationMs}ms`,
    ...Object.entries(result).map(
      ([k, v]) => `${k}: ${Array.isArray(v) ? (v.length ? `\n  ${v.join('\n  ')}` : '—') : JSON.stringify(v)}`
    ),
    '',
  ].join('\n')
})
