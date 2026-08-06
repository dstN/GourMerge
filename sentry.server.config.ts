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

    sendDefaultPii: false,
  })
} finally {
  process.noDeprecation = previousNoDeprecation
}
