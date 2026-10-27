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
 * ## The gap before the SDK exists, and how it is closed
 *
 * Between the first script and `init()` there is no client, so an error thrown in a plugin's
 * setup or during hydration would have nowhere to go. Two things cover that window, the same
 * way Sentry's own loader script does: a small queue — `window` `error` and
 * `unhandledrejection` listeners plus Nuxt's `app:error` / `vue:error` hooks remember what was
 * thrown — and an early trigger: the first queued error starts the SDK load at once instead
 * of waiting for idle. After `init()` the queue is flushed through `captureException`, the two
 * window listeners are removed (Sentry's own global handlers now hold those events, and
 * keeping ours would report everything twice), and the Nuxt hooks report directly. The
 * queue is capped, because a render loop can throw thousands of times before the chunk
 * arrives. Server-side capture (`sentry.server.config.ts`) is untouched throughout.
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
const EARLY_QUEUE_LIMIT = 20

export default defineNuxtPlugin((nuxtApp) => {
  const { dsn, environment, release } = useRuntimeConfig().public.sentry
  if (!dsn) return

  const isResponseNotFault = (error: unknown) => {
    if (!isNuxtError(error)) return false
    const status = error.statusCode
    return !!status && status >= 300 && status < 500
  }

  // Until the SDK is up, `report` queues and kicks off the load; afterwards it captures.
  const early: { error: unknown; info?: string }[] = []
  let report = (error: unknown, info?: string) => {
    if (early.length < EARLY_QUEUE_LIMIT) early.push({ error, info })
    void load()
  }

  const onWindowError = (event: ErrorEvent) => report(event.error ?? event.message)
  const onRejection = (event: PromiseRejectionEvent) => report(event.reason)
  window.addEventListener('error', onWindowError)
  window.addEventListener('unhandledrejection', onRejection)

  nuxtApp.hook('app:error', (error) => {
    if (!isResponseNotFault(error)) report(error)
  })
  nuxtApp.hook('vue:error', (error, _instance, info) => {
    if (!isResponseNotFault(error)) report(error, info)
  })

  let loading: Promise<void> | null = null
  function load() {
    loading ??= (async () => {
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

      window.removeEventListener('error', onWindowError)
      window.removeEventListener('unhandledrejection', onRejection)
      report = (error, info) => {
        Sentry.captureException(error, info ? { extra: { info } } : undefined)
      }
      for (const { error, info } of early.splice(0)) report(error, info)
    })()
    return loading
  }

  onNuxtReady(() => {
    void load()
  })
})
