/**
 * GourMerge — Database Client (Drizzle ORM + mysql2)
 *
 * Initializes the Drizzle ORM client with a mysql2 connection pool.
 * This file is auto-imported in the server context via `server/utils/`.
 */

import { drizzle } from 'drizzle-orm/mysql2'
import type { MySql2Database } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import * as schema from './schema'

type GourMergeDb = MySql2Database<typeof schema> & { $client: mysql.Pool }
let _db: GourMergeDb | null = null
let _pool: mysql.Pool | null = null

/**
 * Get the Drizzle database instance (singleton with connection pool).
 * Uses the `DATABASE_URL` from runtime config.
 */
export function useDatabase() {
  if (!_db) {
    const config = useRuntimeConfig()

    // On Netcup shared hosting, Phusion Passenger spawns multiple Node processes.
    // Each process has its own pool, so the effective total = processes × limit.
    // Keep limit small (4) to stay well within Netcup's MySQL connection cap.
    _pool = mysql.createPool({
      uri: config.databaseUrl,
      waitForConnections: true,
      connectionLimit: 4,
      maxIdle: 2,
      idleTimeout: 30000,
      connectTimeout: 10000,
      queueLimit: 10,
    })

    _db = drizzle(_pool, {
      schema,
      mode: 'default',
    }) as unknown as GourMergeDb
  }

  return _db
}

/**
 * Gracefully close the database connection pool.
 * Call this on server shutdown.
 */
export async function closeDatabasePool() {
  if (_pool) {
    await _pool.end()
    _pool = null
    _db = null
  }
}
