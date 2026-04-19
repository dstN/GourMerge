/**
 * GourMerge — Database Client (Drizzle ORM + mysql2)
 *
 * Initializes the Drizzle ORM client with a mysql2 connection pool.
 * This file is auto-imported in the server context via `server/utils/`.
 */

import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import * as schema from './schema'

let _db: ReturnType<typeof drizzle> | null = null
let _pool: mysql.Pool | null = null

/**
 * Get the Drizzle database instance (singleton with connection pool).
 * Uses the `DATABASE_URL` from runtime config.
 */
export function useDatabase() {
  if (!_db) {
    const config = useRuntimeConfig()

    _pool = mysql.createPool({
      uri: config.databaseUrl,
      waitForConnections: true,
      connectionLimit: 10,
      maxIdle: 10,
      idleTimeout: 60000,
      queueLimit: 0,
    })

    _db = drizzle(_pool, {
      schema,
      mode: 'default',
    })
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
