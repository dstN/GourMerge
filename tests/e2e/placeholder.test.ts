// E2E tests will be added in Phase 1+ once flows exist.
// Placeholder keeps the directory committed.
import { test, expect } from '@playwright/test'

test.skip('placeholder — E2E flows added in Phase 1+', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/GourMerge/)
})
