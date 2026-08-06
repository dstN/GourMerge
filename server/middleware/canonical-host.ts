/**
 * Redirect `www.` to the apex, before anything else looks at the request.
 *
 * Runs ahead of `csrf.ts` (Nitro orders `server/middleware/` alphabetically), so a form
 * POST that arrives on `www` is redirected rather than rejected with a bare 403.
 *
 * The decision itself is in `server/utils/canonicalHost.ts` — including why it is
 * deliberately narrow, and why HTTPS is not forced here.
 */
export default defineEventHandler((event) => {
  const redirect = canonicalRedirect(getRequestHost(event), event.path, event.method)
  if (redirect) return sendRedirect(event, redirect.location, redirect.status)
})
