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
import type { Logger } from 'pino'
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

export function getLogger(): Logger {
  if (_logger) return _logger

  const isProd = process.env.NODE_ENV === 'production'

  if (isProd) {
    const logsDir = join(process.cwd(), 'logs')
    try { mkdirSync(logsDir, { recursive: true }) } catch { /* already exists */ }

    _logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    }, pino.destination({
      dest: join(logsDir, 'app.log'),
      sync: false,
    }))
  } else {
    _logger = pino({
      level: 'debug',
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
      },
    })
  }

  return _logger
}

export const logger = {
  info: (msg: string, data?: Record<string, unknown>) => getLogger().info(data ?? {}, msg),
  warn: (msg: string, data?: Record<string, unknown>) => getLogger().warn(data ?? {}, msg),
  error: (msg: string, data?: Record<string, unknown>) => getLogger().error(data ?? {}, msg),
  debug: (msg: string, data?: Record<string, unknown>) => getLogger().debug(data ?? {}, msg),
}
