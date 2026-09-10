import { readFileSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

/**
 * Pull `DATABASE_URL` out of `.env` for local runs.
 *
 * The app under test gets it from Nuxt, which loads `.env` itself; the Playwright process does
 * not, and `support/api.ts` needs a connection to clear the rate-limit counters between
 * registrations. In CI the variable is already in the job environment, so this is a no-op
 * there. Written out rather than pulling in `dotenv` for one variable: the app's own loader is
 * Nuxt's, so a second dotenv in the tree would just be a second thing that can disagree.
 *
 * Only DATABASE_URL, and only if unset — this must not become a general side channel for
 * pointing tests at surprising configuration.
 */
if (!process.env.DATABASE_URL) {
  try {
    const line = readFileSync(new URL('.env', import.meta.url), 'utf8')
      .split(/\r?\n/)
      .find((l) => /^\s*DATABASE_URL\s*=/.test(l))
    const value = line
      ?.slice(line.indexOf('=') + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
    if (value) process.env.DATABASE_URL = value
  } catch {
    // No .env (CI, or a checkout that has not been set up) — resetRateLimits() fails open.
  }
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // The E2E job spends 410s of its ~10 minutes in here, on a 4-vCPU runner that
  // was using one core. Two workers, not four: every spec shares one MySQL
  // database, so parallelism is bounded by data collisions rather than by CPU.
  // The 8 describe blocks that genuinely depend on ordering already declare
  // `mode: 'serial'` themselves and stay serial regardless of this number.
  // If flakiness appears in the gate, put this back to 1 first.
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  // Generous timeouts: against `npm run dev` the first hit to a route triggers
  // on-demand Vite compilation, which can take well over the 30s default.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.APP_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    // Added while diagnosing the CI-only `copy-ingredients` clipboard flake: a screenshot at
    // the moment of failure is readable directly, no trace-viewer session needed, and it is
    // the fastest way to see whether the failure is even the state it looks like from the
    // assertion alone (e.g. an unexpected dialog, an unclicked button, a focus indicator).
    screenshot: 'only-on-failure',
    navigationTimeout: 90_000,
    actionTimeout: 20_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Locally: reuse the running `npm run dev`. In CI: serve the built artifact.
    command: process.env.CI ? 'node .output/server/index.mjs' : 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
