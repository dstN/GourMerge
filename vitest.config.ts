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

        // The 1.2.0 batch. These are DB/SMTP/session orchestration end to end — no
        // branch in any of them decides anything a mock could not trivially fake.
        // Their *rules* are unit-tested where the rules actually live: the notice
        // schedule in inactivityEmails.test.ts (which also asserts the Nitro and CLI
        // consumers cannot drift), and the sealing primitive in seal.test.ts.
        'server/utils/completeLogin.ts', // setUserSession + one UPDATE
        // Token insert + SMTP send. Its one branch-free decision, `isEmailVerificationRequired`,
        // is a single env read; the part worth protecting is that registration calls it at all,
        // which only an end-to-end signup can show.
        'server/utils/emailVerification.ts',
        'server/utils/hardDeleteUser.ts', // FK-ordered deletes — proved by the GDPR API tests
        'server/utils/inactivitySweep.ts', // DB scan + mail send, driven by /tasks/*
        'server/utils/retentionSweep.ts', // DB scan + delete, driven by /tasks/*
        'server/utils/maintenanceConfig.json', // data, not code — v8 counts it as two lines
        // seal.ts and pendingTotp.ts are deliberately NOT excluded: a forgeable seal or
        // a TTL that does not expire would silently defeat the second factor.
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
