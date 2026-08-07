import mysql from 'mysql2/promise'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Resolve DATABASE_URL from env or the project .env (Playwright doesn't auto-load it). */
function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  try {
    const dir = dirname(fileURLToPath(import.meta.url))
    const envPath = resolve(dir, '../../../.env') // tests/e2e/support → repo root
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^DATABASE_URL=(.*)$/)
      if (m) return m[1].replace(/^["']|["']$/g, '').trim()
    }
  } catch {
    /* fall through */
  }
  throw new Error('DATABASE_URL is not set and was not found in .env')
}

/**
 * Clear the DB-backed rate limiter. Auth endpoints are rate-limited per IP, and
 * all tests hit them from localhost, so we reset between auth-heavy specs.
 */
export async function resetRateLimits(): Promise<void> {
  const conn = await mysql.createConnection(databaseUrl())
  try {
    await conn.execute('DELETE FROM rate_limit_hits')
  } finally {
    await conn.end()
  }
}

/**
 * One-off query against the app's own database, for assertions no HTTP response exposes —
 * e.g. that a token row exists, or a column changed. A connection per call, not a pool: an
 * open pool keeps the Node process alive after the last test, and Playwright hangs at the
 * end of the run instead of exiting (same reasoning as `resetRateLimits` above).
 */
export async function dbQuery<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  const conn = await mysql.createConnection(databaseUrl())
  try {
    const [rows] = await conn.execute(sql, params)
    return rows as T[]
  } finally {
    await conn.end()
  }
}
