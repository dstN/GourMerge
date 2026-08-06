/**
 * GET /robots.txt
 *
 * A route rather than `public/robots.txt`, because the `Sitemap:` directive must be an
 * absolute URL and that made the static file a *second* hardcoded copy of the app's
 * host — one that drifted: it advertised `gourmerge.app` long after the site became
 * `gourmerge.de`, pointing crawlers at a domain that is not the site. It now reads the
 * same `public.appUrl` the sitemap itself uses, so the two cannot disagree.
 */
export default defineEventHandler((event) => {
  const appUrl = useRuntimeConfig().public.appUrl.replace(/\/$/, '')

  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600, s-maxage=3600')

  return `User-agent: *
Allow: /
Disallow: /api/
Disallow: /auth/
Disallow: /tasks/

# Private recipe pages are already gated server-side (404 for unauthenticated),
# but noindex meta is also set on the page itself for defense-in-depth.

Sitemap: ${appUrl}/sitemap.xml
`
})
