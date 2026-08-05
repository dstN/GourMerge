import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // The unit-coverage gate targets pure, deterministic logic. I/O adapters
      // (DB/SMTP/fs/session) and UI-state composables are validated by the
      // API/integration + E2E suites instead — unit-mocking them would test the
      // mocks, not behavior.
      include: ['server/utils/**', 'app/utils/**'],
      exclude: [
        'server/utils/drizzle.ts', // mysql2 pool singleton
        'server/utils/logger.ts', // pino + rotating file stream
        'server/utils/mailer.ts', // nodemailer transport
        'server/utils/rateLimit.ts', // DB-backed — covered by API tests
        'server/utils/requireVerified.ts', // DB + session — covered by API tests
        'server/utils/dataExport.ts', // pure DB reads — covered by the GDPR API tests
        // dataRequest.ts is NOT excluded: hashToken is a pure security primitive
        // and is unit-tested. Only its DB lookup is left to the API tests.
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 70,
      },
    },
    include: ['tests/unit/**/*.{test,spec}.{ts,js}', 'tests/component/**/*.{test,spec}.{ts,js}'],
    exclude: ['tests/e2e/**'],
  },
})
