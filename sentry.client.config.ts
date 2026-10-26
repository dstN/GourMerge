import * as Sentry from '@sentry/nuxt'

Sentry.init({
  // DSN is read from runtimeConfig.public.sentry.dsn — injected at build time.
  dsn: useRuntimeConfig().public.sentry.dsn,
  environment: useRuntimeConfig().public.sentry.environment,
  release: useRuntimeConfig().public.sentry.release || undefined,

  /**
   * Errors only — no browser tracing.
   *
   * `tracesSampleRate: 0.1` installed `browserTracingIntegration` at boot, which sets up
   * PerformanceObservers, navigation//resource instrumentation and long-task tracking on the
   * main thread during exactly the window Lighthouse scores as Total Blocking Time. TBT
   * carries weight 30 — more than any other metric — and it is the one holding the mobile
   * score at 98 rather than 100.
   *
   * What is given up is real: Sentry's field performance data (Web Vitals from actual
   * visitors), which is better evidence than any lab run. What is kept is the reason Sentry
   * is here at all — error capture — which is untouched. If the field data turns out to
   * matter more than the two points, put `tracesSampleRate: 0.1` back and delete the
   * `integrations` filter; nothing else depends on this.
   *
   * The filter is belt-and-braces: `hasTracingEnabled()` is already false without a
   * sample rate, but an explicit removal cannot be re-enabled by a default changing upstream.
   */
  integrations: (defaults) => defaults.filter((integration) => integration.name !== 'BrowserTracing'),

  // No `sendDefaultPii` any more: Sentry 11 removed the option, and nothing in the v11
  // SDK sets `user.ip_address = '{{auto}}'` on events — the behaviour `sendDefaultPii:
  // false` used to buy is now the only behaviour.

  // Ignore common browser noise that isn't actionable.
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'Network request failed',
    'Failed to fetch',
    'Load failed',
  ],
})
