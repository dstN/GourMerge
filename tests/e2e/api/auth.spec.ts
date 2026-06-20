import { test, expect } from '@playwright/test'
import { resetRateLimits } from '../support/db'
import { uniqueUser } from '../support/api'

// Reset the DB-backed rate limiter before each test (register = 3/min per IP).
test.describe.configure({ mode: 'serial' })
test.beforeEach(async () => {
  await resetRateLimits()
})

test('register auto-logs in, allows a protected mutation, logout revokes it', async ({ request }) => {
  const user = uniqueUser()
  const reg = await request.post('/auth/register', { data: user })
  expect(reg.status()).toBe(201)

  // Authenticated: the session cookie is in the request jar.
  const patch = await request.patch('/api/users/me', { data: { bio: 'hello from e2e' } })
  expect(patch.ok()).toBeTruthy()

  const logout = await request.post('/auth/logout')
  expect(logout.ok()).toBeTruthy()

  // After logout the protected route is rejected.
  const afterLogout = await request.patch('/api/users/me', { data: { bio: 'nope' } })
  expect(afterLogout.status()).toBe(401)
})

test('duplicate registration is rejected (409)', async ({ request }) => {
  const user = uniqueUser()
  expect((await request.post('/auth/register', { data: user })).status()).toBe(201)
  // Register auto-logs in; log out so the duplicate attempt is unauthenticated
  // (authenticated requests to /auth/* are redirected away by the guest guard).
  await request.post('/auth/logout')
  expect((await request.post('/auth/register', { data: user })).status()).toBe(409)
})

test('invalid registration is rejected (422)', async ({ request }) => {
  const res = await request.post('/auth/register', {
    data: { username: 'x', email: 'not-an-email', password: 'short' },
  })
  expect(res.status()).toBe(422)
})

test('login with a wrong password fails (401), correct password succeeds', async ({ request }) => {
  const user = uniqueUser()
  await request.post('/auth/register', { data: user })
  await request.post('/auth/logout')

  const bad = await request.post('/auth/login', { data: { email: user.email, password: 'wrong-password' } })
  expect(bad.status()).toBe(401)

  const good = await request.post('/auth/login', { data: { email: user.email, password: user.password } })
  expect(good.ok()).toBeTruthy()
})

test('preferredLocale accepts all four locales (fr/it included)', async ({ request }) => {
  await request.post('/auth/register', { data: uniqueUser() })
  for (const locale of ['de', 'en', 'fr', 'it']) {
    const res = await request.patch('/api/users/me', { data: { preferredLocale: locale } })
    expect(res.ok(), `locale ${locale}`).toBeTruthy()
  }
})
