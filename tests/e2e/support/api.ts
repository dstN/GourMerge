import type { APIRequestContext } from '@playwright/test'

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

/** Register a user (auto-logs in: the session cookie lands in `request`'s jar). */
export async function registerUser(request: APIRequestContext, user: TestUser = uniqueUser()): Promise<TestUser> {
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
