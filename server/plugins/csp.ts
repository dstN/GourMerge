/**
 * Per-request Content-Security-Policy.
 *
 * In production we drop `'unsafe-inline'` from `script-src` and instead put a
 * fresh per-request nonce on every inline <script> Nuxt emits (hydration
 * payload, color-mode FOUC guard, JSON-LD, entry bootstrap…), sending
 * `script-src 'self' 'nonce-…'`. In development we keep `'unsafe-inline'`
 * because Vite/HMR injects inline scripts we cannot nonce.
 *
 * CSP is set here (not in `routeRules`) because a static header cannot carry a
 * per-request nonce. The hook only runs for HTML renders, so API/auth JSON
 * responses are unaffected — matching the previous `routeRules` carve-outs.
 */
import { randomBytes } from 'node:crypto'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const isProd = process.env.NODE_ENV === 'production'

    let scriptSrc: string
    if (isProd) {
      const nonce = randomBytes(16).toString('base64')
      const addNonce = (chunks: string[]) =>
        chunks.map((c) => c.replace(/<script(?=[\s>])/g, `<script nonce="${nonce}"`))
      html.head = addNonce(html.head)
      html.bodyPrepend = addNonce(html.bodyPrepend)
      html.bodyAppend = addNonce(html.bodyAppend)
      scriptSrc = `script-src 'self' 'nonce-${nonce}' https://browser.sentry-cdn.com`
    } else {
      scriptSrc = "script-src 'self' 'unsafe-inline' https://browser.sentry-cdn.com"
    }

    const csp = [
      "default-src 'self'",
      // TipTap requires unsafe-inline for inline styles on the prosemirror editor.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      scriptSrc,
      "connect-src 'self' https://*.sentry.io",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')

    setResponseHeader(event, 'Content-Security-Policy', csp)
  })
})
