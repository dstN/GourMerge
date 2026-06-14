/**
 * GET /api/health — Health check endpoint
 *
 * Returns server status and uptime. Used by load balancers,
 * monitoring systems, and Docker health checks.
 */
import { sql } from 'drizzle-orm'

export default defineEventHandler(async () => {
  // Basic DB connectivity check
  let dbStatus: string
  try {
    const db = useDrizzle()
    if (!db) {
      dbStatus = 'disconnected'
    } else {
      await db.execute(sql`SELECT 1`)
      dbStatus = 'connected'
    }
  }
  catch {
    dbStatus = 'disconnected'
  }

  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStatus,
  }
})
