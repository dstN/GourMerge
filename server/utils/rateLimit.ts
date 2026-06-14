/**
 * useRateLimit — Simple in-memory rate limiter for Nitro event handlers
 *
 * Uses a Map<string, number[]> to track timestamps per key (IP address).
 * Entries auto-clean on each check. NOT suitable for distributed/multi-process
 * deployments — use Redis-backed rate limiting in production clusters.
 */
const rateLimitStore = new Map<string, number[]>()

interface RateLimitOptions {
  /** Maximum number of requests in the window */
  max: number
  /** Window size in seconds */
  windowSeconds: number
}

/**
 * Check rate limit for a given key. Throws 429 if exceeded.
 */
export function useRateLimit(key: string, options: RateLimitOptions): void {
  const now = Date.now()
  const windowMs = options.windowSeconds * 1000
  const cutoff = now - windowMs

  // Get existing timestamps and filter expired ones
  const timestamps = (rateLimitStore.get(key) || []).filter((t) => t > cutoff)

  if (timestamps.length >= options.max) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many requests. Please try again later.',
    })
  }

  timestamps.push(now)
  rateLimitStore.set(key, timestamps)
}

/**
 * Get the IP address from a Nitro event for rate limiting.
 */
export function getRateLimitKey(event: any, prefix: string): string {
  const forwarded = getHeader(event, 'x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || getHeader(event, 'x-real-ip') || 'unknown'
  return `${prefix}:${ip}`
}
