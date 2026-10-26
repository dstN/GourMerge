/**
 * validate-recipe-route — Middleware to prevent [username]/[slug] routes
 * from hijacking reserved paths like /auth, /api, /dashboard, etc.
 *
 * This runs before the page renders and aborts if the "username" param
 * matches a reserved route prefix.
 */
const RESERVED_PATHS = new Set([
  'api',
  'auth',
  'dashboard',
  'recipes',
  'settings',
  'explore',
  'admin',
  'login',
  'register',
  'logout',
  '_nuxt',
  '__nuxt',
  // RFC 8615. `/.well-known/ai-catalog.json` used to render the "recipe not found" page with
  // a 200, and Lighthouse's `ard-schema` audit read that as a catalog that exists and is not
  // JSON — a scored 0 instead of "not applicable". The real well-known routes are Nitro
  // handlers and never reach this middleware; this makes everything else under the prefix a
  // proper 404, as a soft 404 for a reserved namespace is wrong for crawlers too.
  '.well-known',
])

export default defineNuxtRouteMiddleware((to) => {
  const username = to.params.username as string
  if (username && RESERVED_PATHS.has(username.toLowerCase())) {
    // Don't handle this — let it fall through to actual routes or 404
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  }
})
