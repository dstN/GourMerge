import { createHash, randomBytes } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { registerUser, uniqueUser } from './support/api'
import { resetRateLimits, dbQuery } from './support/db'

/**
 * Reported: settings has no way to change the account's email address at all — the field
 * doesn't exist on the page, and `PATCH /api/users/me` doesn't accept it server-side either.
 *
 * Built as a two-step confirm flow rather than an immediate switch, matching the pattern
 * already used for password reset and the GDPR self-service links: `POST /api/users/me/email`
 * only mints a token and mails the NEW address; `GET /auth/confirm-email-change` is what
 * actually updates `users.email` (and, since clicking it is proof of ownership, sets
 * `email_verified_at` in the same step — see the schema comment on `emailChangeTokens`).
 */
test.beforeEach(async () => {
  await resetRateLimits()
})

test.describe('email address change', () => {
  test('request: validates password, uniqueness, and leaves a pending token', async ({ request }) => {
    const user = await registerUser(request, uniqueUser('emailreq'))
    const other = await registerUser(request, uniqueUser('emailother'))

    // Re-authenticate as `user` — `registerUser` for `other` overwrote the session cookie.
    const login = await request.post('/auth/login', { data: { identifier: user.email, password: user.password } })
    expect(login.ok()).toBeTruthy()

    const wrongPassword = await request.post('/api/users/me/email', {
      data: { newEmail: 'new-' + user.email, password: 'not-the-password' },
    })
    expect(wrongPassword.status()).toBe(401)

    const sameAddress = await request.post('/api/users/me/email', {
      data: { newEmail: user.email, password: user.password },
    })
    expect(sameAddress.status()).toBe(409)

    const takenAddress = await request.post('/api/users/me/email', {
      data: { newEmail: other.email, password: user.password },
    })
    expect(takenAddress.status()).toBe(409)

    // `POST /api/users/me/email` allows 3 requests per hour per IP — the right production
    // limit for a security-sensitive action, and exactly why the three checks above must not
    // count against the one this test actually cares about. Same reasoning as `registerUser`
    // clearing the table before every registration: this is one test, not four attackers.
    await resetRateLimits()
    const newEmail = `changed-${Date.now()}@example.test`
    const ok = await request.post('/api/users/me/email', { data: { newEmail, password: user.password } })
    expect(ok.ok()).toBeTruthy()
    expect(await ok.json()).toEqual({ sent: true })

    const rows = await dbQuery<{ new_email: string; used_at: string | null; expires_at: string }>(
      `SELECT ect.new_email, ect.used_at, ect.expires_at
       FROM email_change_tokens ect JOIN users u ON u.id = ect.user_id
       WHERE u.email = ? ORDER BY ect.id DESC LIMIT 1`,
      [user.email]
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.new_email).toBe(newEmail)
    expect(rows[0]?.used_at).toBeNull()
    expect(new Date(rows[0]!.expires_at).getTime()).toBeGreaterThan(Date.now())
  })

  test('confirm: updates the address, verifies it, and the link is single-use', async ({ request }) => {
    const user = await registerUser(request, uniqueUser('emailconfirm'))
    const newEmail = `confirmed-${Date.now()}@example.test`

    // Mints a token the exact way `/api/users/me/email` does, and inserts it directly —
    // this isolates the CONFIRM endpoint from mail delivery, which dev has no way to
    // capture (SMTP isn't configured, so `sendMail` only logs `to`/`subject`, never the
    // body the real token would appear in).
    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    const [{ id: userId }] = await dbQuery<{ id: number }>('SELECT id FROM users WHERE email = ?', [user.email])
    await dbQuery('INSERT INTO email_change_tokens (user_id, new_email, token_hash, expires_at) VALUES (?, ?, ?, ?)', [
      userId,
      newEmail,
      tokenHash,
      new Date(Date.now() + 60_000),
    ])

    const first = await request.get(`/auth/confirm-email-change?token=${rawToken}`, { maxRedirects: 0 })
    expect(first.status()).toBe(302)
    expect(first.headers()['location']).toBe('/auth/email-changed')

    const [row] = await dbQuery<{ email: string; email_verified_at: string | null }>(
      'SELECT email, email_verified_at FROM users WHERE id = ?',
      [userId]
    )
    expect(row?.email).toBe(newEmail)
    expect(row?.email_verified_at).not.toBeNull()

    // Single-use: the same link a second time must not silently succeed again.
    const second = await request.get(`/auth/confirm-email-change?token=${rawToken}`, { maxRedirects: 0 })
    expect(second.status()).toBe(400)
  })
})
