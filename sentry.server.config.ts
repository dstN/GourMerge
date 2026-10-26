import * as Sentry from '@sentry/nuxt'

/**
 * Silence one upstream deprecation, for the duration of `Sentry.init` only.
 *
 * On Node 26, `@sentry/node-core`'s `initializeEsmLoader()` calls the deprecated
 * `module.register()` to install `import-in-the-middle`'s ESM hooks, which emits
 * `DEP0205`. Nuxt's console renderer routes `process.emitWarning` output through
 * its error channel, so it surfaces during `npm run dev` labelled **ERROR** —
 * looking like a startup failure when the server has in fact started fine.
 *
 * Why suppress rather than fix: the call is in Sentry's SDK, not ours, and the
 * real fix (migrating to `module.registerHooks()`) belongs upstream. The obvious
 * local alternative — `registerEsmLoaderHooks: false` — would disable the ESM
 * auto-instrumentation that `tracesSampleRate` below depends on, trading a
 * cosmetic warning for a real loss of tracing. Not worth it.
 *
 * The flag is set for exactly the one synchronous call that emits, then restored,
 * so no other deprecation anywhere in the app is hidden. Remove this wrapper once
 * `@sentry/node-core` targets `module.registerHooks()` — if the warning is already
 * gone the wrapper is a harmless no-op, but it should still be cleaned up.
 */
const previousNoDeprecation = process.noDeprecation
process.noDeprecation = true

try {
  Sentry.init({
    dsn: process.env.NUXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.NUXT_SENTRY_RELEASE || undefined,

    // Server-side tracing: capture 10% of requests to limit overhead on shared hosting.
    tracesSampleRate: 0.1,

    // No `sendDefaultPii` any more — removed in Sentry 11, which never infers the
    // user's IP into events on its own; `false` is now the only behaviour.

    /**
     * Drop expected 4xx.
     *
     * `server/plugins/error-handler.ts` already states the policy — "4xx are
     * intentional — skip" — but that hook only governs *our* logger. Sentry's Nitro
     * instrumentation captures every thrown `H3Error` on its own, so the policy was
     * being applied to the log file and nowhere else. The result: every scanner that
     * POSTs to `/api/*` with a foreign `Origin` raised a `CSRF: origin not allowed`
     * issue, and 404s from link rot filed themselves alongside real crashes. Alerts
     * that fire on healthy behaviour get muted, and then the 500 that mattered is
     * muted with them.
     *
     * A 4xx is the app correctly refusing something. Where one is genuinely worth
     * knowing about, it is logged at the throw site with the detail that explains it
     * (see `server/middleware/csrf.ts`) — the log is the right channel for that,
     * because it carries the offending value and does not page anyone. 5xx, unhandled
     * rejections and client-side errors are unaffected.
     */
    beforeSend(sentryEvent, hint) {
      const status = (hint?.originalException as { statusCode?: number } | undefined)?.statusCode
      if (typeof status === 'number' && status >= 400 && status < 500) return null
      return sentryEvent
    },
  })
} finally {
  process.noDeprecation = previousNoDeprecation
}
