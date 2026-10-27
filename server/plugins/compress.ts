/**
 * Compress the server-rendered HTML before it leaves Nitro.
 *
 * Measured on the local production build, Lighthouse mobile: the document is 50 KB and the
 * entry stylesheet 226 KB on the wire, because Nitro's `node-server` preset sends everything
 * uncompressed. On the audit's simulated 1.6 Mbit/s that is ~1.4 s of pure transfer before
 * the first paint; `document-latency-insight` flagged it as "No compression applied". The
 * static side is handled by `nitro.compressPublicAssets` in `nuxt.config.ts` (pre-built
 * `.br`/`.gz` siblings that the static handler serves by `Accept-Encoding`); the HTML is
 * rendered per request, so it has to be compressed per request — here.
 *
 * In production nginx already gzips on the fly, so the visible change there is gzip → brotli
 * (about a fifth smaller on this HTML). A proxy does not re-encode a body that already carries
 * `Content-Encoding`, and neither does Apache's mod_deflate, so this cannot double-compress.
 *
 * Not for the error page's INNER render. When a server handler throws, Nuxt's Nitro error
 * handler renders the error page by fetching `/__nuxt_error` through `localFetch` with the
 * original request headers, then takes the result as TEXT (`res.text()`), copies its headers
 * onto the real response and sends that string. Compressing the inner render therefore
 * produced a body that was brotli bytes mangled through a UTF-8 decode, sent under a
 * `content-encoding: br` header — "Decompression failed" in every client. The E2E suite caught
 * it on the 409 from a duplicate registration and the 400 from a reused e-mail token (both
 * answered as HTML, because Playwright's request client sends `Accept: * / *`; API routes and
 * JSON-accepting clients get Nitro's JSON error and never touched this path). The inner render
 * is recognised by the context flag the error handler sets, and by its path as a fallback;
 * the outer response is then plain HTML, which the proxy may compress as before.
 *
 * Brotli at quality 5 rather than the default 11: the default is for assets compressed once at
 * build time and costs ~10× the CPU for a few percent of size. Quality 5 is a few milliseconds
 * for a page this size and still well ahead of gzip. Async, so the event loop is not held for
 * it. Below 1 KB (the health JSON, a redirect page) the headers cost more than they save.
 */
import { brotliCompress, gzip, constants } from 'node:zlib'
import { promisify } from 'node:util'

const brotli = promisify(brotliCompress)
const gzipAsync = promisify(gzip)

const MIN_BYTES = 1024

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', async (response, { event }) => {
    if (typeof response.body !== 'string') return
    if (response.headers?.['content-encoding']) return
    // The error handler's internal render (see above), and island renders, which are read
    // back as text by Nuxt itself as well.
    const nuxtContext = event.context.nuxt as Record<string, unknown> | undefined
    if (nuxtContext?.['~rendering-error'] || event.path.startsWith('/__nuxt_')) return

    const accept = getRequestHeader(event, 'accept-encoding') ?? ''
    const encoding = /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null
    if (!encoding) return

    const raw = Buffer.from(response.body, 'utf8')
    if (raw.length < MIN_BYTES) return

    const compressed =
      encoding === 'br'
        ? await brotli(raw, {
            params: {
              [constants.BROTLI_PARAM_QUALITY]: 5,
              [constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
            },
          })
        : await gzipAsync(raw, { level: 6 })

    const headers = (response.headers ??= {})
    headers['content-encoding'] = encoding
    headers['vary'] = headers['vary'] ? `${headers['vary']}, Accept-Encoding` : 'Accept-Encoding'
    // Nitro's `RenderResponse` types the body as a string; h3 sends a Buffer as raw bytes,
    // which is exactly what a compressed body needs.
    response.body = compressed as unknown as string
  })
})
