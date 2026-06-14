// https://nuxt.com/docs/4.x/api/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-05-01',

  future: {
    compatibilityVersion: 4,
  },

  modules: [
    '@nuxt/ui',
    '@nuxtjs/i18n',
    '@vite-pwa/nuxt',
    'nuxt-auth-utils',
    '@nuxt/eslint',
  ],

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
      { code: 'en', name: 'English', file: 'en.json' },
      { code: 'de', name: 'Deutsch', file: 'de.json' },
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
          src: '/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: '/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
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
    },
  },

  // ── Head / Fonts ───────────────────────────────────────────
  app: {
    head: {
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=JetBrains+Mono:wght@400;500;600&display=swap',
        },
      ],
    },
  },

  // ── Dev Tools ───────────────────────────────────────────────
  devtools: { enabled: true },
})
