// https://nuxt.com/docs/4.x/api/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-05-01',

  future: {
    compatibilityVersion: 4,
  },

  modules: ['@nuxt/ui', '@nuxtjs/i18n', '@vite-pwa/nuxt', 'nuxt-auth-utils', '@nuxt/eslint', '@sentry/nuxt/module'],

  css: ['~/assets/css/main.css'],

  // ── nuxt-auth-utils ─────────────────────────────────────────
  // `webAuthn` gates the passkey handlers and the `useWebAuthn()` composable behind
  // an explicit opt-in, and makes the module hard-fail at build time if
  // `@simplewebauthn/{server,browser}` are missing — better than discovering it at
  // runtime when someone tries to enrol a key.
  auth: {
    webAuthn: true,
  },

  // ── Nuxt UI v4 ──────────────────────────────────────────────
  ui: {
    theme: {
      colors: ['primary', 'secondary', 'success', 'info', 'warning', 'error'],
      transitions: true,
    },
  },

  // ── Icons ───────────────────────────────────────────────────
  //
  // Every E2E and a11y run was full of `[Icon] failed to load icon 'lucide:compass'` and
  // ten more. Not log noise: measured on the built artifact, the SSR HTML contained
  // `<span class="iconify i-lucide:compass">` with NO CSS defining that class. Those icons
  // were invisible in the server-rendered page and only appeared once the client bundle
  // hydrated — and never at all without JS.
  //
  // The cause is not the server bundle, which is a red herring I chased first: the
  // production build DOES inline both collections (`.output/server/chunks/_/icons.mjs`,
  // 1817 lucide icons, `compass` among them). That bundle exists to serve
  // `/api/_nuxt_icon/:collection` to the browser. The SSR render path is different — the
  // component calls `loadIcon()` in `@nuxt/icon/runtime/components/shared.js`, which
  // checks the CLIENT bundle and otherwise falls back to `@iconify/vue`'s loader, i.e. an
  // HTTP fetch to the Iconify API. Any icon missing from the client bundle therefore
  // depends on a network call during SSR, and that is what was failing.
  //
  // And the client bundle was never scanning our source. `clientBundle.scan` is off by
  // default; the 43 icons it did contain come from Nuxt UI, which contributes its own via
  // the `icon:clientBundleIcons` hook. Every icon WE put in a template was missing, which
  // is why the failures tracked whichever page had been rendered rather than looking like a
  // config problem.
  //
  // Listing the missing names explicitly was the first attempt and it is whack-a-mole:
  // eleven fixed, then five more appeared as soon as /help/glossary was rendered. `scan`
  // is the actual answer — it walks the source for icon names, so adding an icon to a
  // component stays a one-line change.
  //
  // The 256KB default `sizeLimitKb` is left alone: the whole set costs tens of KB, since
  // only icons actually referenced get inlined, not the 1817-icon collection.
  // Production confirmed the chain end to end: the browser first tried
  // `https://api.iconify.design/lucide.json?icons=book-marked,chef-hat,compass,…`, our CSP
  // refused it (`connect-src 'self' https://*.sentry.io`), and the retry against
  // `/api/_nuxt_icon/lucide.json` came back 502. Two separate faults stacked on one symptom.
  //
  // `fallbackToApi: false` closes the first one for good. A third-party request for icons is
  // the same problem as the Google Fonts <link> that was removed from `app.head` — it sends
  // every visitor's IP to someone else's server on page load, before any consent. That the
  // CSP already blocked it means the policy was doing its job while the app kept trying;
  // this stops the trying. A missed icon now renders as nothing instead of as a blocked
  // request, which is the honest failure mode.
  icon: {
    clientBundle: {
      scan: true,
    },
    fallbackToApi: false,
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
      /**
       * `|| undefined`, not `|| ''`. The token this expects is a Sentry
       * **organization** token (scope `org:ci` — "Source Map Upload, Release
       * Creation"), and those encode their own org, so `sentry-cli` infers it. An
       * empty string is a *provided* value and overrides that inference, turning a
       * correctly-configured build into "organization slug is required". Leaving the
       * key undefined lets the token speak for itself, while still honouring
       * SENTRY_ORG when it is set.
       */
      org: process.env.SENTRY_ORG || undefined,
      project: process.env.SENTRY_PROJECT || 'gourmerge',
      authToken: process.env.SENTRY_AUTH_TOKEN || undefined,
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
