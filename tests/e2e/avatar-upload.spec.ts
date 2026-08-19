import { test, expect } from '@playwright/test'
import sharp from 'sharp'
import { registerUser } from './support/api'
import { resetRateLimits } from './support/db'

/**
 * Drives the actual cropper in a real browser, unlike `api/avatar.spec.ts` which only checks
 * the upload endpoint's contract. This exists because the endpoint contract cannot see two
 * classes of bug that only show up in a browser:
 *
 * - `AvatarCropper.vue`'s live preview is a `blob:` URL (`URL.createObjectURL`); it silently
 *   fails to paint under a `Content-Security-Policy` whose `img-src` does not list `blob:`,
 *   which happened here — the "Apply crop" button stayed disabled forever with no error.
 * - Its export path (`<canvas>` + `drawImage`) is exactly the class of code
 *   `vitest.config.ts` excludes from unit coverage ("neither of which happy-dom implements"),
 *   so a real browser is the only thing that exercises it at all.
 */
test.beforeEach(async () => {
  await resetRateLimits()
})

/** A real, decodable square photo, distinct enough that a cropped sub-region is not blank. */
async function squarePhoto(edge: number): Promise<Buffer> {
  const mark = Buffer.from(
    `<svg width="${edge}" height="${edge}">` +
      `<circle cx="${edge * 0.3}" cy="${edge * 0.3}" r="${edge * 0.2}" fill="rgb(40,90,160)"/>` +
      `<circle cx="${edge * 0.7}" cy="${edge * 0.65}" r="${edge * 0.12}" fill="rgb(230,210,60)"/>` +
      `</svg>`
  )
  return sharp({ create: { width: edge, height: edge, channels: 3, background: { r: 200, g: 120, b: 60 } } })
    .composite([{ input: mark, top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer()
}

test('picking a photo opens the cropper, and confirming stores a square WebP avatar', async ({ page }) => {
  // The page's own context, not the standalone `request` fixture — they have separate
  // cookie jars, and the browser navigation below needs the session this sets.
  const request = page.context().request
  const user = await registerUser(request)
  // The onboarding welcome modal is unrelated to this test and its backdrop would intercept
  // the very clicks this test makes — settled directly through the API rather than by
  // clicking through it, same as `startTourAtNewRecipeStep` avoids doing in `tour.spec.ts`.
  await request.patch('/api/users/me', { data: { onboardingCompletedAt: new Date().toISOString() } })

  await page.goto('/settings', { waitUntil: 'load' })
  // Wait for Vue hydration so @change="onPick" is attached before setInputFiles fires the
  // native event below — a raw goto outruns it (see tour.spec.ts/journey.spec.ts). Settings
  // mounts enough cards (profile, avatar, email, passkeys, 2FA, the cookie banner) that this
  // page was the one where the race finally surfaced: the click always landed, but the
  // dispatched change event had no listener yet, so the cropper never opened.
  await page
    .waitForFunction(() => !!(document.querySelector('#__nuxt') as unknown as { __vnode?: unknown })?.__vnode, null, {
      timeout: 30_000,
    })
    .catch(() => {})

  await page
    .locator('button')
    .filter({ hasText: /foto hochladen|upload photo/i })
    .click()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    buffer: await squarePhoto(800),
  })

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const slider = dialog.getByRole('slider')
  await expect(slider).toBeVisible()
  // Zoom in a couple of steps — exercises the re-clamp path in `AvatarCropper.vue`, not just
  // the default 1:1 framing.
  await slider.focus()
  await slider.press('ArrowRight')
  await slider.press('ArrowRight')

  const applyButton = dialog.locator('button').filter({ hasText: /zuschnitt übernehmen|apply crop/i })
  await expect(applyButton).toBeEnabled({ timeout: 10_000 })
  await applyButton.click()

  // Nuxt UI's toast renders its message both in the visible card and in a second,
  // `aria-hidden` live-region echo for screen readers — `getByText` alone matches both.
  await expect(page.locator('[data-slot="title"]').filter({ hasText: /foto aktualisiert|photo updated/i })).toBeVisible(
    { timeout: 10_000 }
  )
  await expect(dialog).toBeHidden()

  const profile = await (await request.get(`/api/users/${user.username}`)).json()
  expect(profile.user.avatarUrl).toMatch(new RegExp(`^/api/users/${user.username}/avatar-image\\?v=[0-9a-f]{64}$`))

  const delivered = await request.get(profile.user.avatarUrl)
  expect(delivered.status()).toBe(200)
  expect(delivered.headers()['content-type']).toContain('image/webp')

  // Remove it — falls back to the generated identicon, and the button relabels accordingly.
  await page
    .locator('button')
    .filter({ hasText: /^löschen$|^delete$/i })
    .click()
  await expect(page.locator('[data-slot="title"]').filter({ hasText: /foto entfernt|photo removed/i })).toBeVisible({
    timeout: 10_000,
  })

  const cleared = await (await request.get(`/api/users/${user.username}`)).json()
  expect(cleared.user.avatarUrl).toBeNull()
  await expect(page.locator('button').filter({ hasText: /foto hochladen|upload photo/i })).toBeVisible()
})
