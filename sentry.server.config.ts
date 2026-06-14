import * as Sentry from '@sentry/nuxt'

Sentry.init({
  dsn: process.env.NUXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  release: process.env.NUXT_SENTRY_RELEASE || undefined,

  // Server-side tracing: capture 10% of requests to limit overhead on shared hosting.
  tracesSampleRate: 0.1,

  sendDefaultPii: false,
})
