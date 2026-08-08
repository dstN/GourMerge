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
    // `language` is the BCP47 tag, and it is REQUIRED for `hreflang` — not decoration.
    // Without it `useLocaleHead()` skipped the alternate links silently: a correct
    // `<link rel="canonical">` was emitted and `grep -c hreflang` returned 0, with nothing in
    // any log. Turning on `experimental.strictSeo` converted that silence into
    // `Locale 'language' ISO code is required to generate alternate link` and a 500, which is
    // how the cause was finally visible.
    //
    // Region-less tags on purpose. `de-DE` / `en-US` would claim we target those countries;
    // this content is German, English, French and Italian without regional variants, and a
    // bare language tag is what tells Google "any German speaker" rather than "Germany".
    locales: [
      { code: 'de', language: 'de', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en', name: 'English', file: 'en.json' },
      { code: 'fr', language: 'fr', name: 'Français', file: 'fr.json' },
      { code: 'it', language: 'it', name: 'Italiano', file: 'it.json' },
    ],
    defaultLocale: 'de',
    /**
     * Required for SEO, not cosmetic. `useLocaleHead()` in `app.vue` builds the `hreflang`
     * alternates and the canonical link from this, and both must be ABSOLUTE URLs — with no
     * `baseUrl` the tags are emitted with relative hrefs, which search engines ignore. Before
     * this was set, production shipped neither tag at all.
     *
     * Baked at build time, with the production host as the fallback: `NUXT_PUBLIC_APP_URL` is a
     * runtime variable on the host and is therefore NOT available while CI builds the artifact,
     * so reading it here alone would have produced `http://localhost:3000` in the released
     * build. If the domain ever changes, the runtime override is `NUXT_PUBLIC_I18N_BASE_URL` —
     * i18n keeps this in `runtimeConfig.public.i18n`, so it can be corrected without a rebuild.
     */
    baseUrl: process.env.NUXT_PUBLIC_APP_URL || 'https://gourmerge.de',
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
      // `navigateFallback: null`, and it has to be the literal key, not just an absent one.
      // Omitting the key was the first attempt and it did NOT work: `@vite-pwa/nuxt` fills in
      // its OWN default — `nuxt.options.app.baseURL ?? '/'` — for any workbox config that
      // doesn't already have a `navigateFallback` property (see
      // `@vite-pwa/nuxt/dist/shared/nuxt.*.mjs`, `configurePWAOptions`:
      // `if (!('navigateFallback' in options.workbox)) options.workbox.navigateFallback = ... ?? '/'`).
      // So the key coming back out of the merge was `'/'` again regardless, and the generated
      // sw.js kept registering:
      //
      //   Uncaught (in promise) non-precached-url: non-precached-url :: [{"url":"/"}]
      //     at Y.createHandlerBoundToURL (workbox-*.js)
      //     at /sw.js
      //
      // `navigateFallback` names a URL that Workbox will serve from the PRECACHE for any
      // navigation it cannot fetch, so the URL has to be in the precache manifest.
      // `globPatterns` builds that manifest from files on disk, and this app is
      // server-rendered — there is no `index.html` for `/`, so the entry could never exist and
      // `createHandlerBoundToURL()` rejected. A service worker that throws on navigation is
      // worse than none: it produced a console error for every visitor while delivering
      // exactly zero offline capability.
      //
      // `null`, not `false`: `workbox-build`'s schema validates `navigateFallback` as
      // `null | string` and rejects a boolean outright (`WorkboxConfigError:
      // [GenerateSW.navigateFallback] 'navigateFallback' property type must be null,string.`).
      // `null` both satisfies that schema and is falsy, so `workbox-build`'s sw-template still
      // skips the `NavigationRoute`/`createHandlerBoundToURL` block (`<% if (navigateFallback)
      // %>`), and the explicit key satisfies the module's `'navigateFallback' in
      // options.workbox` check, so its own default-injection never fires either. Verified
      // against the built `.output/public/sw.js` — no `NavigationRoute` call in the output.
      //
      // Costs nothing that worked: offline navigation was never functioning; asset and API
      // caching below are unaffected, since they are runtime caching and do not touch the
      // precache. Doing this properly needs a real precached shell — a prerendered `/offline`
      // route added via `additionalManifestEntries` and pointed at here — which is a feature,
      // not a one-line config fix. Recorded in ROADMAP.
      navigateFallback: null,
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

  /**
   * ── Stop preloading the whole module graph in the document head.
   *
   * Measured on the mobile Lighthouse run: 57 script requests, 326 KiB, **all started at
   * t=116ms at priority High**, because Nuxt emits a `<link rel="modulepreload">` for every
   * chunk the entry statically imports. On the mobile profile's 1.4 Mbps link that is ~1.8s
   * of transfer, and the render-blocking `entry.css` sits in the same queue competing for it.
   *
   * The two numbers that make the case: unthrottled FCP is 290ms, simulated FCP is 2550ms.
   * The gap is almost entirely bandwidth, and it is bandwidth spent on JavaScript the first
   * paint does not need — the page is server-rendered, so the HTML is already complete, and
   * the scripts are `type="module"` and therefore deferred by definition. They are needed to
   * hydrate, not to paint.
   *
   * Dropping the hints does NOT drop the requests: those chunks are still statically imported
   * and still fetched. They are merely discovered after the entry parses — after the
   * stylesheet has had the pipe to itself. Later discovery costs Time-to-Interactive, which
   * Lighthouse does not score; earlier paint buys FCP (weight 10), LCP (25) and Speed Index
   * (10), which it does.
   *
   * `prefetch` goes with it. That flag emits `<link rel="prefetch">` for OTHER routes' chunks
   * during the initial load — bandwidth spent on pages the visitor has not asked for while the
   * one they did ask for is still painting. `<NuxtLink>` prefetches on hover and on visibility
   * at runtime independently of this flag, so navigation stays warm.
   */
  hooks: {
    'build:manifest'(manifest) {
      for (const entry of Object.values(manifest)) {
        entry.preload = false
        entry.prefetch = false
      }
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
    // Lighthouse: 390KiB of "est. savings" from missing cache headers, all of it hashed build
    // assets, on desktop and mobile alike.
    //
    // Safe by construction: every filename under `/_nuxt/` carries a content hash, so
    // `immutable` can never serve a stale asset — a change produces a new URL. Scoped to the
    // build directory and never `/**`, which would put a one-year cache on the HTML and leave
    // visitors on the old page after a deploy.
    //
    // ── This rule does NOT currently reach the browser in production. Read on before
    //    "fixing" it, and before believing either of the two stories above it in git log.
    //
    // Measured against the live site, on the deploy that contains this file:
    //
    //   GET /api/health          → cache-control: no-store, max-age=0   ← the rule below it
    //   GET /_nuxt/<hash>.js     → ETag + Last-Modified, and NOTHING else
    //   GET /_fonts/<hash>.woff2 → ETag, and nothing else
    //
    // So route rules work here — `/api/health` proves it. What the asset responses are missing
    // is not just `cache-control`: they carry none of the `/**` security headers above and no
    // `x-request-id` either. Nothing that touches Nitro comes back that bare. Those files are
    // served off disk by the web server (Plesk's "Smart static files processing"), and Nitro
    // never sees the request.
    //
    // The earlier reading — "a non-existent `/_nuxt/*.js` returns Nitro's JSON 404, therefore
    // these requests reach the app" — is true and proves nothing. A MISS is exactly the case
    // that falls through to Passenger; a HIT is the case in question, and it does not. Testing
    // a missing file to learn how existing files are served is the whole error, and it is an
    // easy one to repeat, which is why it is written down instead of deleted.
    //
    // The rules stay: they cost nothing, they are correct, and they start working the moment
    // the assets are served by the app (any host without smart static processing, `nuxt
    // preview`, a container). Making them fire on THIS host means turning that Plesk feature
    // off, which hands every asset to Node — a real cost for a Lighthouse item weighted 0.
    // Deliberately not done. Note the trap that started it all: `Server: nginx` is on EVERY
    // response here because nginx is the edge proxy. It says nothing about who produced the body.
    '/_nuxt/**': {
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
    },
    // Same reasoning, different directory. `@nuxt/fonts` (transitive via Nuxt UI) downloads
    // DM Sans and JetBrains Mono at build time and serves them from here with hashed
    // filenames, plus the generated fallback-metric faces. Fonts are the assets where a
    // revalidation hurts most — a blocked font is invisible text.
    '/_fonts/**': {
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
    },
    // The opposite instruction, for the one route where a cached answer is a lie. UptimeRobot
    // polls this every few minutes and the deploy smoke test gates a release on it; either
    // reading a proxy's copy would report a healthy site that is not running. `no-store`
    // rather than `no-cache`: no-cache still permits storing and revalidating.
    '/api/health': {
      headers: { 'cache-control': 'no-store, max-age=0' },
    },
  },

  // ── Nitro server preset (Passenger uses node-server) ────────
  nitro: {
    preset: 'node-server',
  },

  // ── Dev Tools ───────────────────────────────────────────────
  devtools: { enabled: true },
})
