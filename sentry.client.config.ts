import * as Sentry from '@sentry/nuxt'

Sentry.init({
  // DSN is read from runtimeConfig.public.sentry.dsn — injected at build time.
  dsn: useRuntimeConfig().public.sentry.dsn,
  environment: useRuntimeConfig().public.sentry.environment,
  release: useRuntimeConfig().public.sentry.release || undefined,

  // Only send errors to Sentry; reduce noise from non-critical warnings.
  tracesSampleRate: 0.1,

  // Never send PII — strip user emails/IPs automatically.
  sendDefaultPii: false,

  // Ignore common browser noise that isn't actionable.
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'Network request failed',
    'Failed to fetch',
    'Load failed',
  ],
})
