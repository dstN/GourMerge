/**
 * Canonical-host decision, as a pure function so it can be tested without an event.
 *
 * ## Why this lives in the app and not in Apache config
 *
 * Netcup's panel configures Passenger directly (application root, startup file,
 * application mode, custom environment variables), so there is **no `.htaccess` on the
 * host at all** — and there is an nginx proxy in front of Apache, so a rewrite rule in
 * one is not guaranteed to be consulted. A redirect that ships inside the artifact is
 * the only version that certainly runs, and it needs no manual step after a deploy.
 *
 * ## Why a canonical host matters here more than for a typical site
 *
 * Three things key off the request hostname, and `www` breaks all three:
 *
 *   - **The WebAuthn RP ID *is* the hostname.** `gourmerge.de` and `www.gourmerge.de`
 *     are different relying parties, so a passkey enrolled on one does not exist on the
 *     other — the login simply reports no credential.
 *   - **The CSRF check** compares the request origin against `NUXT_PUBLIC_APP_URL`, so
 *     every mutation on the wrong host returns 403.
 *   - **`/api/health`** returns 503 there for the same reason, which would make the
 *     deploy smoke test fail if it ever pointed at `www`.
 *
 * ## Why only `www.` is stripped
 *
 * Narrow on purpose. Redirecting *any* host that disagrees with `NUXT_PUBLIC_APP_URL`
 * would loop forever if that variable were itself wrong — the failure mode would be an
 * unreachable site. Stripping a leading `www.` cannot loop, because the target host
 * never matches the pattern that triggered it. Every *other* host mismatch is surfaced
 * loudly by `/api/health` instead of being silently papered over.
 *
 * HTTPS is not forced here: the host already 301s http → https for both names, and
 * adding a second scheme-based redirect behind a proxy is how redirect loops get made.
 */

/** GET/HEAD keep 301 (cacheable, SEO-friendly); anything else needs 308 to preserve the method and body. */
const PERMANENT_KEEPING_METHOD = 308
const PERMANENT = 301

export interface CanonicalRedirect {
  status: number
  location: string
}

export function canonicalRedirect(host: string | undefined, path: string, method: string): CanonicalRedirect | null {
  if (!host) return null

  // ACME http-01 must never be redirected: the challenge is answered per-hostname, so
  // forwarding it would hand back the wrong token. The live certificate is a wildcard
  // (issued via dns-01, which does not use HTTP at all), so this is belt-and-braces —
  // but it costs nothing and silently expiring certificates are expensive.
  if (path.startsWith('/.well-known/')) return null

  const match = /^www\.(.+)$/i.exec(host)
  if (!match) return null

  const apex = match[1]
  // Guard against a pathological `Host: www.` — redirecting to an empty host would
  // produce a protocol-relative URL pointing at whatever came next in the path.
  if (!apex || !apex.includes('.')) return null

  return {
    status: method === 'GET' || method === 'HEAD' ? PERMANENT : PERMANENT_KEEPING_METHOD,
    location: `https://${apex}${path}`,
  }
}
