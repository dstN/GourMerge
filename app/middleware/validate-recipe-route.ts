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
  'admin',
  '_nuxt',
  '__nuxt',
])

export default defineNuxtRouteMiddleware((to) => {
  const username = to.params.username as string
  if (username && RESERVED_PATHS.has(username.toLowerCase())) {
    // Don't handle this — let it fall through to actual routes or 404
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  }
})
