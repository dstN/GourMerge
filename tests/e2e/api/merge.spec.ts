import { test, expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { resetRateLimits } from '../support/db'
import { registerUser, createRecipe, createIngredient, commitSnapshot } from '../support/api'

test.describe.configure({ mode: 'serial' })
test.beforeEach(async () => {
  await resetRateLimits()
})

function ing(ingredientId: number, quantity: string, sortOrder = 0) {
  return { ingredientId, quantity, unit: 'g', sortOrder, notes: null }
}

async function createBranch(request: APIRequestContext, recipeId: number, name: string, fromBranchId: number) {
  const res = await request.post(`/api/recipes/${recipeId}/branches`, { data: { name, fromBranchId } })
  if (!res.ok()) throw new Error(`createBranch failed: ${res.status()} ${await res.text()}`)
  return res.json() as Promise<{ id: number }>
}

async function openGmr(request: APIRequestContext, recipeId: number, sourceBranchId: number, targetBranchId: number) {
  const res = await request.post(`/api/recipes/${recipeId}/gourmerge-requests`, {
    data: { title: 'Merge me', sourceBranchId, targetBranchId },
  })
  if (!res.ok()) throw new Error(`openGmr failed: ${res.status()} ${await res.text()}`)
  return (await res.json()).id as number
}

test('clean merge: non-conflicting branch change merges into target', async ({ request }) => {
  await registerUser(request)
  const recipe = await createRecipe(request)
  const flour = await createIngredient(request, `Flour ${Date.now()}`)
  const sugar = await createIngredient(request, `Sugar ${Date.now()}`)

  // Base commit on main.
  await commitSnapshot(request, recipe.id, recipe.branchId, { message: 'base', ingredients: [ing(flour, '100')] })
  const feature = await createBranch(request, recipe.id, 'feature', recipe.branchId)
  // Source adds sugar (target unchanged) → no conflict.
  await commitSnapshot(request, recipe.id, feature.id, {
    message: 'add sugar',
    ingredients: [ing(flour, '100'), ing(sugar, '50', 1)],
  })

  const gmrId = await openGmr(request, recipe.id, feature.id, recipe.branchId)
  const res = await request.post(`/api/recipes/${recipe.id}/gourmerge-requests/${gmrId}/merge`, { data: {} })
  const body = await res.json()
  expect(body.success).toBe(true)
  expect(body.hasConflicts).toBeFalsy()
})

test('conflict is detected, then resolved by choosing the source side', async ({ request }) => {
  const owner = await registerUser(request)
  const recipe = await createRecipe(request)
  const butter = await createIngredient(request, `Butter ${Date.now()}`)

  // base: 100g on main
  await commitSnapshot(request, recipe.id, recipe.branchId, { message: 'base', ingredients: [ing(butter, '100')] })
  const variant = await createBranch(request, recipe.id, 'variant', recipe.branchId)
  // source: 150g on variant
  await commitSnapshot(request, recipe.id, variant.id, { message: 'source', ingredients: [ing(butter, '150')] })
  // target: 200g on main → both sides changed the same ingredient differently
  await commitSnapshot(request, recipe.id, recipe.branchId, { message: 'target', ingredients: [ing(butter, '200')] })

  const gmrId = await openGmr(request, recipe.id, variant.id, recipe.branchId)

  // No resolutions → conflict reported, merge aborted.
  const conflictRes = await request.post(`/api/recipes/${recipe.id}/gourmerge-requests/${gmrId}/merge`, { data: {} })
  const conflictBody = await conflictRes.json()
  expect(conflictBody.success).toBe(false)
  expect(conflictBody.hasConflicts).toBe(true)
  expect(conflictBody.conflicts.some((c: { ingredientId?: number }) => c.ingredientId === butter)).toBe(true)

  // Resolve to source (150g) → merge completes.
  const resolveRes = await request.post(`/api/recipes/${recipe.id}/gourmerge-requests/${gmrId}/merge`, {
    data: { resolutions: [{ type: 'ingredient', ingredientId: butter, choice: 'source' }] },
  })
  expect((await resolveRes.json()).success).toBe(true)

  // Target branch now has the source value (150g).
  const detail = await (await request.get(`/api/recipes/by-slug/${owner.username}/${recipe.slug}`)).json()
  const merged = detail.currentIngredients.find((i: { ingredientId: number }) => i.ingredientId === butter)
  expect(Number(merged.quantity)).toBe(150)

  // Merged GMR is immutable (cannot merge again).
  const again = await request.post(`/api/recipes/${recipe.id}/gourmerge-requests/${gmrId}/merge`, { data: {} })
  expect(again.status()).toBe(422)
})
