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
    public: {
      appName: 'GourMerge',
      appSlogan: 'Fork the recipe, merge the flavor.',
    },
  },

  // ── Dev Tools ───────────────────────────────────────────────
  devtools: { enabled: true },
})
