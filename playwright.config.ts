import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  // Generous timeouts: against `npm run dev` the first hit to a route triggers
  // on-demand Vite compilation, which can take well over the 30s default.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.APP_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
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
