/**
 * GourMerge — Structured Logger (Pino)
 *
 * Writes structured JSON logs.
 * In production: to a rotating log file (logs/app.log, max 10MB, retain 7 days).
 * In development: pretty-printed to stderr.
 *
 * Redacts sensitive fields so they never appear in log output.
 */
import pino from 'pino'
import PinoPretty from 'pino-pretty'
import type { Logger } from 'pino'
import { createStream } from 'rotating-file-stream'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'body.password',
  'body.passwordHash',
  'password',
  'passwordHash',
  'token',
  'sessionPassword',
]

let _logger: Logger | null = null

/** pino's built-in levels. Anything else makes `pino()` THROW rather than warn. */
const PINO_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']

/**
 * Resolve LOG_LEVEL defensively, because getting this wrong took production down.
 *
 * Sentry, from the live site: `default level:info  must be included in custom levels`, thrown
 * by `pino()` inside `getLogger()`. Note the DOUBLE space in that message — it is
 * `default level:${level} must be…`, so the value was `"info "`, with a trailing space picked
 * up from the Netcup panel's environment-variable field. pino rejects an unknown level by
 * throwing.
 *
 * The consequence was out of all proportion to the typo. The logger is built lazily on first
 * use, and the first use in a healthy request cycle is often `logger.error()` — so an error
 * would occur, the app would try to report it, the logger would throw, and the process would
 * die mid-response. Passenger reported "Incomplete response received from application" and
 * the browser got a 502, including on `/api/recipes/explore`. Every 502 we have been chasing
 * came from a stray space.
 *
 * So: trim and lowercase, fall back instead of throwing, and say so on stderr. A logger is
 * infrastructure for reporting failure; it must not be able to cause one.
 */
export function resolveLevel(fallback: string): string {
  const raw = process.env.LOG_LEVEL
  if (!raw) return fallback
  const level = raw.trim().toLowerCase()
  if (PINO_LEVELS.includes(level)) return level
  // console, deliberately: the logger does not exist yet, and this must be visible.
  console.warn(`[logger] LOG_LEVEL=${JSON.stringify(raw)} is not a pino level — using "${fallback}".`)
  return fallback
}

export function getLogger(): Logger {
  if (_logger) return _logger

  const isProd = process.env.NODE_ENV === 'production'

  if (isProd) {
    const logsDir = join(process.cwd(), 'logs')
    try {
      mkdirSync(logsDir, { recursive: true })
    } catch {
      /* already exists */
    }

    // Rotating file stream (not a pino transport worker) — worker-thread module
    // resolution is unreliable in Nitro's bundled output on shared hosting.
    // Rotates at 10 MB or daily, keeps 7 gzipped files.
    const stream = createStream('app.log', {
      path: logsDir,
      size: '10M',
      interval: '1d',
      maxFiles: 7,
      compress: 'gzip',
    })

    _logger = pino(
      {
        level: resolveLevel('info'),
        redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      },
      stream
    )
  } else {
    // Use pino-pretty as a stream (not a transport worker) so it works in Nitro's
    // bundled dev environment where worker-thread module resolution can fail.
    const stream = PinoPretty({ colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' })
    _logger = pino({ level: resolveLevel('debug'), redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, stream)
  }

  return _logger
}

export const logger = {
  info: (msg: string, data?: Record<string, unknown>) => getLogger().info(data ?? {}, msg),
  warn: (msg: string, data?: Record<string, unknown>) => getLogger().warn(data ?? {}, msg),
  error: (msg: string, data?: Record<string, unknown>) => getLogger().error(data ?? {}, msg),
  debug: (msg: string, data?: Record<string, unknown>) => getLogger().debug(data ?? {}, msg),
}
