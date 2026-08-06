import { sql, and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { rateLimitHits } from '~~/server/database/schema'

interface RateLimitOptions {
  max: number
  windowSeconds: number
}

/**
 * DB-backed rate limiter — safe across Phusion Passenger multi-process.
 *
 * Uses atomic INSERT … ON DUPLICATE KEY UPDATE to increment a counter per
 * (bucketKey, windowStart) pair. A SELECT after the upsert reads the count.
 * The two-query approach has a negligible race window at the threshold boundary;
 * at auth-endpoint scale (limit ≤ 10/min) this is acceptable without Redis.
 */
export async function useRateLimit(key: string, options: RateLimitOptions): Promise<void> {
  const db = useDrizzle()
  // If DB is not yet available, fail open (don't block all requests during startup).
  if (!db) return

  const windowStart = Math.floor(Date.now() / 1000 / options.windowSeconds) * options.windowSeconds

  // Atomic upsert: insert or increment
  await db
    .insert(rateLimitHits)
    .values({ bucketKey: key, windowStart, count: 1 })
    .onDuplicateKeyUpdate({ set: { count: sql`${rateLimitHits.count} + 1` } })

  // Read back the current count
  const [row] = await db
    .select({ count: rateLimitHits.count })
    .from(rateLimitHits)
    .where(and(eq(rateLimitHits.bucketKey, key), eq(rateLimitHits.windowStart, windowStart)))
    .limit(1)

  if ((row?.count ?? 0) > options.max) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many requests. Please try again later.',
    })
  }
}

/**
 * Build a rate-limit bucket key from the request IP + a route prefix.
 *
 * ⚠ The first X-Forwarded-For segment is CLIENT-CONTROLLED, so as written every limit here is
 * bypassable: send a different `X-Forwarded-For` per request and each one lands in its own
 * bucket. XFF is built left to right — each proxy appends the address it received from — so
 * the leftmost entry is whatever the original caller chose to put there, not a fact about the
 * connection.
 *
 * Not fixed here, on purpose. The correct entry is at `length - <number of trusted proxies>`,
 * and getting that number wrong is worse than the current state: if it resolves to the proxy's
 * own address, every user on the site shares one bucket and registration breaks globally after
 * three attempts. Our chain is nginx → Apache → Passenger, which should yield
 * `client, 127.0.0.1` and therefore index `length - 2`, but "should" is doing real work in that
 * sentence and nothing is deployed yet to check it against. The fix is: log one real request's
 * XFF on the host, count the hops, then pin the index — see the entry in ROADMAP.
 */
export function getRateLimitKey(event: H3Event, prefix: string): string {
  const forwarded = getHeader(event, 'x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || getHeader(event, 'x-real-ip') || 'unknown'
  return `${prefix}:${ip}`
}
