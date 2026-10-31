/**
 * Sentry in the browser — errors only, loaded on the first error or the first interaction.
 *
 * This replaces the conventional `sentry.client.config.ts`. With that file present, the
 * `@sentry/nuxt` module registers a plugin that `await`s the config module before any other
 * plugin runs, which puts the whole browser SDK — its download, its parse and `Sentry.init()`
 * with the default integrations (global handlers, breadcrumbs on fetch/XHR/DOM/history,
 * dedupe, …) — on the critical path to the first interactive frame. On the mobile profile
 * that is work inside the one long task Lighthouse scores as Total Blocking Time, weight 30,
 * spent on a visitor who has not had an error yet.
 *
 * ## When the SDK loads
 *
 * Not at idle. A first version loaded it from `onNuxtReady`, and PageSpeed against production
 * showed why that is not enough: the chunk still arrives inside the window Lighthouse measures
 * (Time to Interactive needs five quiet seconds, so "idle" is well before it), it was 129 KiB on
 * the wire, and `unused-javascript` listed it as the largest piece of code the page never ran.
 * Now nothing loads until one of two things happens: an error is thrown, or the visitor
 * interacts (`pointerdown`, `keydown`, `focusin`). A page that is only looked at never pays for
 * monitoring; a page that is used has the SDK up before the user can do anything that needs
 * reporting. The cost is breadcrumbs: Sentry only records those from the moment it exists,
 * so an error on the first tap has no trail before that tap. The error itself is not lost —
 * see the next section.
 *
 * ## The gap before the SDK exists, and how it is closed
 *
 * Before `init()` there is no client, so an error thrown in a plugin's setup, during hydration
 * or before the first interaction would have nowhere to go. A small queue covers that, the
 * same way Sentry's own loader script does: `window` `error` and `unhandledrejection`
 * listeners plus Nuxt's `app:error` / `vue:error` hooks remember what was thrown, and the
 * first queued error starts the load at once. After `init()` the queue is flushed through
 * `captureException`, the two window listeners are removed (Sentry's own global handlers now
 * hold those events, and keeping ours would report everything twice), and the Nuxt hooks
 * report directly. The queue is capped, because a render loop can throw thousands of times
 * before the chunk arrives. Server-side capture (`sentry.server.config.ts`) is untouched.
 *
 * ## Why `@sentry/browser`, not `@sentry/nuxt`
 *
 * The Nuxt package's client entry re-exports all of `@sentry/vue`, which re-exports all of
 * `@sentry/browser` — Session Replay, User Feedback and browser tracing included — and that
 * whole graph survived into the chunk (428 KB raw) although only `init` and
 * `captureException` were ever called. Importing the two names from `@sentry/browser` directly
 * leaves the bundler a graph it can prune. What `@sentry/nuxt`'s `init` added on top was SDK
 * metadata (events say "sentry.javascript.browser" now instead of "…nuxt") and nothing else;
 * the Vue integration it would have attached is not needed, because every error thrown in a
 * component reaches `vue:error` (Nuxt installs `app.config.errorHandler` for exactly that),
 * and what the integration adds is the component name on the event, not the error.
 *
 * Errors only — no browser tracing, same trade as before: `browserTracingIntegration` sets up
 * PerformanceObservers and long-task tracking on the main thread during exactly the window
 * Lighthouse measures. It is not among `@sentry/browser`'s defaults; the filter below is
 * belt-and-braces, so an upstream default cannot re-enable it.
 */
const EARLY_QUEUE_LIMIT = 20
const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'focusin'] as const

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

  const onInteraction = () => {
    for (const type of INTERACTION_EVENTS) window.removeEventListener(type, onInteraction, true)
    void load()
  }
  for (const type of INTERACTION_EVENTS) window.addEventListener(type, onInteraction, { capture: true, passive: true })

  let loading: Promise<void> | null = null
  function load() {
    loading ??= (async () => {
      const { init, captureException } = await import('@sentry/browser')

      init({
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
          // Thrown by a script Microsoft injects into pages — Outlook's SafeLinks scanner and
          // the Office browser add-in — as an unhandled rejection with a plain string reason.
          // It has nothing to do with the page; the first production event came from a link
          // scanner visiting /en with a desktop-Chrome user agent. Widely known, never ours.
          /Object Not Found Matching Id:\d+, MethodName:\w+, ParamCount:\d+/,
        ],
        // Code that browser extensions run inside the page is not our code either.
        denyUrls: [/^chrome-extension:\/\//i, /^moz-extension:\/\//i, /^safari-(web-)?extension:/i, /\/extensions\//i],
      })

      window.removeEventListener('error', onWindowError)
      window.removeEventListener('unhandledrejection', onRejection)
      report = (error, info) => {
        captureException(error, info ? { extra: { info } } : undefined)
      }
      for (const { error, info } of early.splice(0)) report(error, info)
    })()
    return loading
  }
})
