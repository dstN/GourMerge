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
    throw createError({ statusCode: 403, statusMessage: 'CSRF: origin not allowed' })
  }
})
