import mysql from 'mysql2/promise'
import type { APIRequestContext } from '@playwright/test'

/**
 * Clear the rate-limit counters.
 *
 * `/auth/register` allows 3 requests per minute per IP and `/auth/login` allows 5, which is
 * the right production setting and unworkable for this suite: every test needs its own user,
 * ~34 registrations happen inside a couple of minutes, and all of them come from one host, so
 * they share a single bucket. The first CI run of the E2E workflow failed exactly there —
 * `register failed: 429` in gourmerge-requests.spec.ts, and both retries failed too because
 * the window had not reset. Nothing about that is a product bug; the tests are simply not 34
 * different clients.
 *
 * So the counter is cleared rather than the limiter weakened. Deliberately NOT done by
 * relaxing the limit under a test env flag: that leaves a production instance one
 * misconfiguration away from having no registration limit at all, and it would mean the
 * limiter is never exercised in the environment where we run the whole app. And deliberately
 * not done by varying `X-Forwarded-For` per request, even though `getRateLimitKey` trusts its
 * first segment and it would work — see the note in that function; the tests should not be
 * built on top of that.
 *
 * Fails open. If `DATABASE_URL` is not in the environment there is nothing to clear, and the
 * suite should report the real failure rather than an error from its own helper.
 *
 * Not exported: `registerUser` is the only caller and the clear is table-wide, so it also
 * covers the login limit for tests that sign in afterwards. Export it when a spec genuinely
 * needs its own reset, not before.
 */
async function resetRateLimits(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) return
  // A connection per call, not a pool: an open pool keeps the Node process alive after the
  // last test and Playwright hangs at the end of the run instead of exiting.
  const conn = await mysql.createConnection(url)
  try {
    await conn.query('DELETE FROM rate_limit_hits')
  } finally {
    await conn.end()
  }
}

export interface TestUser {
  username: string
  email: string
  password: string
  displayName: string
}

/** Generate a unique, validation-compliant test user. */
export function uniqueUser(prefix = 'e2e'): TestUser {
  const id = Math.random().toString(36).slice(2, 10)
  return {
    username: `${prefix}_${id}`,
    email: `${prefix}_${id}@example.test`,
    password: 'test-password-123',
    displayName: `Test ${id}`,
  }
}

/**
 * Register a user (auto-logs in: the session cookie lands in `request`'s jar).
 *
 * Clears the rate-limit counters first. Every registering test goes through here, and the
 * clear is table-wide, so the login limit is covered by the same call for tests that sign in
 * again afterwards.
 */
export async function registerUser(request: APIRequestContext, user: TestUser = uniqueUser()): Promise<TestUser> {
  await resetRateLimits()
  const res = await request.post('/auth/register', { data: user })
  if (!res.ok()) throw new Error(`register failed: ${res.status()} ${await res.text()}`)
  return user
}

interface CreatedRecipe {
  id: number
  slug: string
  owner: { username: string }
  branchId: number
  commitId: number
}

/** Create a recipe and return its ids (owner must be authenticated on `request`). */
export async function createRecipe(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {}
): Promise<CreatedRecipe> {
  const res = await request.post('/api/recipes', {
    data: { title: `E2E Recipe ${Math.random().toString(36).slice(2, 8)}`, visibility: 'public', ...overrides },
  })
  if (!res.ok()) throw new Error(`createRecipe failed: ${res.status()} ${await res.text()}`)
  return res.json()
}

/** Create (or dedupe) an ingredient and return its id. */
export async function createIngredient(request: APIRequestContext, name: string): Promise<number> {
  const res = await request.post('/api/ingredients', { data: { name } })
  if (!res.ok()) throw new Error(`createIngredient failed: ${res.status()} ${await res.text()}`)
  const body = await res.json()
  return body.id
}

/** Commit a snapshot to a branch. */
export async function commitSnapshot(
  request: APIRequestContext,
  recipeId: number,
  branchId: number,
  snapshot: { message: string; ingredients?: unknown[]; steps?: unknown[] }
) {
  const res = await request.post(`/api/recipes/${recipeId}/commits`, {
    data: { branchId, ingredients: [], steps: [], ...snapshot },
  })
  if (!res.ok()) throw new Error(`commit failed: ${res.status()} ${await res.text()}`)
  return res.json()
}
