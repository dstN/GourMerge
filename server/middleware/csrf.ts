const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Paths that must be CSRF-validated (browser-initiated mutations)
const PROTECTED_PREFIXES = ['/api/', '/auth/']

export default defineEventHandler((event) => {
  if (!MUTATING_METHODS.has(event.method)) return

  const path = event.path
  if (!PROTECTED_PREFIXES.some((p) => path.startsWith(p))) return

  const origin = getHeader(event, 'origin')
  // No Origin header → curl / server-to-server / mobile — not a browser CSRF vector
  if (!origin) return

  const config = useRuntimeConfig()
  let allowedOrigin: string
  try {
    allowedOrigin = new URL(config.public.appUrl).origin
  } catch {
    // Misconfigured appUrl — fail open in dev, fail closed in prod
    if (process.env.NODE_ENV === 'production') {
      throw createError({ statusCode: 403, statusMessage: 'CSRF: server misconfiguration' })
    }
    return
  }

  if (origin !== allowedOrigin) {
    /**
     * Log the rejected origin. The throw used to carry nothing but the sentence
     * "CSRF: origin not allowed", which makes the two cases that produce it
     * indistinguishable after the fact:
     *
     *   - a scanner POSTing to `/api/*` from somewhere else — expected, ignorable,
     *     and the whole point of the check;
     *   - a real user whose browser sent an origin we did not anticipate (`null`
     *     after a cross-origin redirect, an embedded WebView, a stale PWA client),
     *     which is a bug in *our* funnel and needs fixing.
     *
     * The offending origin is the only field that separates them, so it belongs in
     * the log. `warn`, not `error`: a rejection is the middleware succeeding. The
     * response body still says nothing beyond the status.
     */
    logger.warn('csrf: rejected origin', {
      origin,
      method: event.method,
      path,
      requestId: event.context.requestId,
      userAgent: getHeader(event, 'user-agent'),
    })
    throw createError({ statusCode: 403, statusMessage: 'CSRF: origin not allowed' })
  }
})
