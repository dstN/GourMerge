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
    lazy: true,
    langDir: 'locales',
    strategy: 'prefix_except_default',
    bundle: {
      optimizeTranslationDirective: false,
    },
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
    databaseUrl: process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/gourmerge',
    appUrl: process.env.NUXT_PUBLIC_APP_URL || 'http://localhost:3000',
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
      // Only upload source maps in CI where the auth token is set.
      telemetry: false,
    },
    // Disable source map upload locally (no auth token in dev).
    autoInjectServerSentry: process.env.SENTRY_AUTH_TOKEN ? 'top-level-import' : undefined,
  },

  // ── Head / Fonts ───────────────────────────────────────────
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon-180x180.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=JetBrains+Mono:wght@400;500;600&display=swap',
        },
      ],
    },
  },

  // ── Security Headers + CSP (P6-001) ─────────────────────────
  // Applied to all routes. CSP allows TipTap (needs 'unsafe-inline' for style),
  // Google Fonts, and the Sentry reporting endpoint.
  routeRules: {
    '/**': {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        // HSTS is set in production only via Passenger / .htaccess to avoid
        // breaking local HTTP dev. Uncomment when behind HTTPS:
        // 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': [
          "default-src 'self'",
          // TipTap requires unsafe-inline for inline styles on the prosemirror editor
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          "img-src 'self' data: https:",
          // Scripts: self + Sentry CDN bundle (loaded via @sentry/nuxt)
          "script-src 'self' 'unsafe-inline' https://browser.sentry-cdn.com",
          "connect-src 'self' https://*.sentry.io",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; '),
      },
    },
    // API and auth routes: no page headers needed, disable CSP header inheritance
    '/api/**': { headers: {} },
    '/auth/**': { headers: {} },
  },

  // ── Nitro server preset (Passenger uses node-server) ────────
  nitro: {
    preset: 'node-server',
  },

  // ── Dev Tools ───────────────────────────────────────────────
  devtools: { enabled: true },
})
