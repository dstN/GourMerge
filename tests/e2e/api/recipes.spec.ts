import { test, expect } from '@playwright/test'
import { resetRateLimits } from '../support/db'
import { uniqueUser, registerUser, createRecipe } from '../support/api'

test.describe.configure({ mode: 'serial' })
test.beforeEach(async () => {
  await resetRateLimits()
})

test('create recipe → fetch by slug', async ({ request }) => {
  const owner = await registerUser(request)
  const recipe = await createRecipe(request, { title: 'Pancakes Supreme' })
  expect(recipe.slug).toContain('pancakes')

  const res = await request.get(`/api/recipes/by-slug/${owner.username}/${recipe.slug}`)
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.title).toBe('Pancakes Supreme')
  expect(body.owner.username).toBe(owner.username)
})

test('star toggles and updates the counter', async ({ request }) => {
  await registerUser(request)
  const recipe = await createRecipe(request)

  const on = await request.post(`/api/recipes/${recipe.id}/star`)
  expect(on.ok()).toBeTruthy()
  expect((await on.json()).starred).toBe(true)

  const off = await request.post(`/api/recipes/${recipe.id}/star`)
  expect((await off.json()).starred).toBe(false)
})

test('fork creates an independent copy owned by the forker', async ({ request }) => {
  await registerUser(request)
  const recipe = await createRecipe(request, { title: 'Forkable Stew', visibility: 'public' })
  await request.post('/auth/logout')

  const other = await registerUser(request)
  const forkRes = await request.post(`/api/recipes/${recipe.id}/fork`)
  expect(forkRes.ok()).toBeTruthy()
  const fork = await forkRes.json()

  const detail = await (await request.get(`/api/recipes/by-slug/${other.username}/${fork.slug}`)).json()
  expect(detail.owner.username).toBe(other.username)
  expect(detail.forkedFromRecipeId).toBe(recipe.id)
})

test('a non-owner cannot modify or delete a recipe (403)', async ({ request }) => {
  await registerUser(request)
  const recipe = await createRecipe(request)
  await request.post('/auth/logout')

  await registerUser(request, uniqueUser('other'))
  expect((await request.patch(`/api/recipes/${recipe.id}`, { data: { title: 'Hijacked' } })).status()).toBe(403)
  expect((await request.delete(`/api/recipes/${recipe.id}`)).status()).toBe(403)
})

test('anonymous users cannot create recipes (401)', async ({ request }) => {
  const res = await request.post('/api/recipes', { data: { title: 'No Auth', visibility: 'public' } })
  expect(res.status()).toBe(401)
})
