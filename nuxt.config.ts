// https://nuxt.com/docs/4.x/api/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-05-01',

  future: {
    compatibilityVersion: 4,
  },

  modules: ['@nuxt/ui', '@nuxtjs/i18n', '@vite-pwa/nuxt', 'nuxt-auth-utils', '@nuxt/eslint', '@sentry/nuxt/module'],

  css: ['~/assets/css/main.css'],

  // ── Nuxt UI v4 ──────────────────────────────────────────────
  ui: {
    theme: {
      colors: ['primary', 'secondary', 'success', 'info', 'warning', 'error'],
      transitions: true,
    },
  },

  // ── i18n ────────────────────────────────────────────────────
  i18n: {
    locales: [
      { code: 'de', name: 'Deutsch', file: 'de.json' },
      { code: 'en', name: 'English', file: 'en.json' },
      { code: 'fr', name: 'Français', file: 'fr.json' },
      { code: 'it', name: 'Italiano', file: 'it.json' },
    ],
    defaultLocale: 'de',
    // `lazy` was removed in @nuxtjs/i18n v10 — lazy loading is unconditional now.
    langDir: 'locales',
    strategy: 'prefix_except_default',
    // `bundle.optimizeTranslationDirective` was removed in @nuxtjs/i18n v10 —
    // the option no longer exists on PluginOptions and is a typecheck error.
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'gourmerge_locale',
      redirectOn: 'root',
    },
  },

  // ── PWA ─────────────────────────────────────────────────────
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'GourMerge',
      short_name: 'GourMerge',
      description: 'Fork the recipe, merge the flavor.',
      theme_color: '#0f172a',
      background_color: '#0f172a',
      display: 'standalone',
      icons: [
        {
          src: '/icon.svg',
          sizes: 'any',
          type: 'image/svg+xml',
          purpose: 'any maskable',
        },
        {
          src: '/pwa-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/pwa-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/maskable-icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    workbox: {
      // Cache the app shell and navigation routes for offline use (P5-005).
      navigateFallback: '/',
      globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      runtimeCaching: [
        {
          // Cache API responses for viewed recipes for offline reading.
          urlPattern: /^\/api\/recipes\/by-slug\/.*/i,
          handler: 'StaleWhileRevalidate',
          options: {
            cacheName: 'recipe-api-cache',
            expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
          },
        },
      ],
    },
  },

  // ── Runtime Config ──────────────────────────────────────────
  runtimeConfig: {
    // NOTE ON RUNTIME OVERRIDES. nuxt.config is evaluated at BUILD time, so these
    // `process.env` reads only produce the baked default. Nitro re-reads env at
    // runtime only for `NUXT_`-prefixed names matching the config path — i.e.
    // `runtimeConfig.databaseUrl` would need NUXT_DATABASE_URL, not DATABASE_URL.
    // Since DATABASE_URL is the documented name (and the one drizzle-kit needs),
    // server/database/index.ts prefers process.env.DATABASE_URL at runtime.
    databaseUrl: process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/gourmerge',
    // There is deliberately NO top-level `appUrl` here. It used to duplicate
    // public.appUrl, and because its override name would have been NUXT_APP_URL,
    // setting the documented NUXT_PUBLIC_APP_URL on the host left it at
    // http://localhost:3000 — which silently broke the CSRF origin check and put
    // localhost links into verification/reset emails. Server code reads
    // config.public.appUrl, which NUXT_PUBLIC_APP_URL does override at runtime.
    // nuxt-auth-utils reads runtimeConfig.session for H3 SessionConfig
    // httpOnly + sameSite=lax blocks CSRF from cross-site browser requests.
    // secure=true in prod ensures the cookie is only sent over HTTPS.
    session: {
      name: 'gourmerge_session',
      password: process.env.NUXT_SESSION_PASSWORD || '',
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 14, // 14 days
      },
    },
    public: {
      appName: 'GourMerge',
      appSlogan: 'Fork the recipe, merge the flavor.',
      appUrl: process.env.NUXT_PUBLIC_APP_URL || 'http://localhost:3000',
      sentry: {
        dsn: process.env.NUXT_PUBLIC_SENTRY_DSN || '',
        environment: process.env.NODE_ENV || 'development',
        release: process.env.NUXT_SENTRY_RELEASE || '',
      },
    },
  },

  // ── Sentry ───────────────────────────────────────────────────
  sentry: {
    sourceMapsUploadOptions: {
      org: process.env.SENTRY_ORG || '',
      project: process.env.SENTRY_PROJECT || 'gourmerge',
      authToken: process.env.SENTRY_AUTH_TOKEN || '',
      // Source-map UPLOAD only runs in CI where the auth token is set; the
      // module skips upload when authToken is empty.
      telemetry: false,
    },
    // Always inject the server SDK so unhandled Nitro errors are captured in
    // production. This must NOT depend on SENTRY_AUTH_TOKEN (a build-time
    // source-map concern) — otherwise the CI-built artifact ships without
    // server-side capture. With an empty DSN, Sentry.init is a safe no-op.
    autoInjectServerSentry: 'top-level-import',
  },

  // ── Head / Fonts ───────────────────────────────────────────
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon-180x180.png' },
        // NO Google Fonts <link> here. `@nuxt/fonts` (transitive via @nuxt/ui)
        // already downloads DM Sans + JetBrains Mono at build time and serves
        // them from /_fonts/, together with generated fallback-metric faces that
        // prevent layout shift. The two preconnects plus the css2 stylesheet that
        // used to sit here were therefore a duplicate fetch of fonts we already
        // ship — and worse, they sent every visitor's IP to Google on every page
        // load, before any consent (cf. LG München I, 20.01.2022, 3 O 17493/20).
      ],
    },
  },

  // ── Security Headers (P6-001) ───────────────────────────────
  // Static headers applied to all routes. The Content-Security-Policy is set
  // per-request in `server/plugins/csp.ts` instead (it carries a per-request
  // script nonce in production — see that file).
  routeRules: {
    '/**': {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        // HSTS in production only (baked at build, NODE_ENV=production). Browsers
        // ignore HSTS received over plain HTTP, but we still gate it to honor the
        // local-HTTP-dev workflow. Behind Netcup SSL this enforces HTTPS for 1y.
        ...(process.env.NODE_ENV === 'production'
          ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }
          : {}),
      },
    },
  },

  // ── Nitro server preset (Passenger uses node-server) ────────
  nitro: {
    preset: 'node-server',
  },

  // ── Dev Tools ───────────────────────────────────────────────
  devtools: { enabled: true },
})
