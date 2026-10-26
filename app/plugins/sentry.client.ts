/**
 * Sentry in the browser — errors only, and initialised AFTER hydration.
 *
 * This replaces the conventional `sentry.client.config.ts`. With that file present, the
 * `@sentry/nuxt` module registers a plugin that `await`s the config module before any other
 * plugin runs, which puts the whole browser SDK — its download, its parse and `Sentry.init()`
 * with the default integrations (global handlers, breadcrumbs on fetch/XHR/DOM/history,
 * dedupe, …) — on the critical path to the first interactive frame. On the mobile profile
 * that is work inside the one long task Lighthouse scores as Total Blocking Time, weight 30,
 * spent on a visitor who has not had an error yet.
 *
 * Here the SDK is imported dynamically from `onNuxtReady`, i.e. once the app has mounted and
 * the browser is idle. The chunk no longer sits in the entry, and the init runs in its own
 * short task after the page is interactive.
 *
 * ## What is given up
 *
 * An error thrown during the first second — inside hydration, or in a plugin that runs before
 * mount — is not reported, because there is no client yet to catch it. Server-side capture
 * (`sentry.server.config.ts`) is untouched and still sees every SSR failure. If a hydration-
 * time error ever has to be chased in the field, restoring `sentry.client.config.ts` with the
 * same options puts the SDK back in the boot path; nothing else depends on this file.
 *
 * ## What is kept, and how
 *
 * The module's own client plugin (`sentry-client-integrations`) is skipped along with the
 * config file, so what it did for capture is done here: Nuxt's `app:error` / `vue:error`
 * hooks forward to `captureException`, with the module's filter for 3xx/4xx `NuxtError`s,
 * which are responses, not faults. Every error thrown in a component reaches `vue:error`
 * (Nuxt installs `app.config.errorHandler` for exactly that), so nothing is lost by not
 * attaching Sentry's `vueIntegration` as well — which `@sentry/nuxt` does not export for
 * the browser in a form that takes the `app` (its client build ships a stand-in that only
 * records options for the module plugin to read). What that integration would have added
 * is the component name on the event; the error, stack and breadcrumbs are the same.
 *
 * Errors only — no browser tracing, same trade as before: `browserTracingIntegration` sets up
 * PerformanceObservers and long-task tracking on the main thread during exactly the window
 * Lighthouse measures. The `integrations` filter below is belt-and-braces, so an upstream
 * default cannot re-enable it.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const { dsn, environment, release } = useRuntimeConfig().public.sentry
  if (!dsn) return

  onNuxtReady(async () => {
    const Sentry = await import('@sentry/nuxt')

    Sentry.init({
      dsn,
      environment,
      release: release || undefined,
      integrations: (defaults) => defaults.filter((integration) => integration.name !== 'BrowserTracing'),
      // No `sendDefaultPii`: Sentry 11 removed the option, and nothing in the v11 SDK sets
      // `user.ip_address = '{{auto}}'` on events — the behaviour `false` used to buy is now
      // the only behaviour.
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'ResizeObserver loop completed with undelivered notifications',
        'Network request failed',
        'Failed to fetch',
        'Load failed',
      ],
    })

    const isResponseNotFault = (error: unknown) => {
      if (!isNuxtError(error)) return false
      const status = error.statusCode
      return !!status && status >= 300 && status < 500
    }
    nuxtApp.hook('app:error', (error) => {
      if (!isResponseNotFault(error)) Sentry.captureException(error)
    })
    nuxtApp.hook('vue:error', (error, _instance, info) => {
      if (!isResponseNotFault(error)) Sentry.captureException(error, { extra: { info } })
    })
  })
})
