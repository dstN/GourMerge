import { test, expect } from '@playwright/test'
import { resetRateLimits } from '../support/db'
import { uniqueUser, registerUser, createRecipe, createIngredient, commitSnapshot } from '../support/api'

/**
 * Nothing about a private recipe may answer to a stranger — on **any** endpoint.
 *
 * ## What this was written for
 *
 * A white-hat sweep of every `GET` under `/api/recipes/:id/` found three that never checked
 * visibility while their siblings all did:
 *
 * - `branches` — leaked branch names.
 * - `commits` — leaked the whole history: commit messages, author names, timestamps.
 * - `diff` — leaked the recipe's actual ingredients and steps. Worse still, it never scoped
 *   `?from=` / `?to=` to the recipe in the path either, so `/api/recipes/<any public
 *   id>/diff?from=1&to=2` returned commits 1 and 2 *from whatever recipe they belonged to*.
 *   Recipe and commit ids are sequential integers, so walking them dumped every private
 *   recipe in the database, with no session at all.
 *
 * That is the shape of bug a per-endpoint copy of a rule produces: twelve endpoints agreed
 * and three did not, and nothing could tell you which. They now share
 * `requireVisibleRecipe()` / `requireCommitInRecipe()`, and this spec is the thing that
 * notices when endpoint sixteen forgets.
 *
 * **404, never 403.** A 403 confirms the id exists, which on sequential integers is itself
 * the disclosure.
 */
test.describe.configure({ mode: 'serial' })
test.beforeEach(async () => {
  await resetRateLimits()
})

/** A private recipe with two commits, plus a public one to attack it from. */
async function fixtures(request: import('@playwright/test').APIRequestContext) {
  const owner = await registerUser(request, uniqueUser('victim'))
  const flour = await createIngredient(request, 'Mehl, Weizen, hell')

  const secret = await createRecipe(request, { title: 'Secret Sauce', visibility: 'private' })
  await commitSnapshot(request, secret.id, secret.branchId, {
    message: 'the secret ratio',
    ingredients: [{ ingredientId: flour, quantity: '100', unit: 'g', notes: null, sortOrder: 0 }],
    steps: [{ sortOrder: 1, content: 'Guard this closely.', contentTranslations: {} }],
  })
  await commitSnapshot(request, secret.id, secret.branchId, {
    message: 'doubled it',
    ingredients: [{ ingredientId: flour, quantity: '200', unit: 'g', notes: null, sortOrder: 0 }],
    steps: [{ sortOrder: 1, content: 'Guard this even more closely.', contentTranslations: {} }],
  })
  const secretCommits = await (
    await request.get(`/api/recipes/${secret.id}/commits?branchId=${secret.branchId}`)
  ).json()

  const decoy = await createRecipe(request, { title: 'Public Decoy', visibility: 'public' })
  return { owner, secret, decoy, secretCommits }
}

test('branches, commits and diff all refuse a private recipe', async ({ request }) => {
  const { secret, secretCommits } = await fixtures(request)
  // Three: recipe creation writes an initial commit, then the two above.
  expect(secretCommits).toHaveLength(3)
  await request.post('/auth/logout')

  const [newer, older] = secretCommits

  for (const [name, url] of [
    ['branches', `/api/recipes/${secret.id}/branches`],
    ['commits', `/api/recipes/${secret.id}/commits?branchId=${secret.branchId}`],
    ['diff', `/api/recipes/${secret.id}/diff?from=${older.id}&to=${newer.id}`],
    ['snapshot', `/api/recipes/${secret.id}/branches/${secret.branchId}/snapshot`],
    ['by id', `/api/recipes/${secret.id}`],
  ] as const) {
    const res = await request.get(url)
    expect(res.status(), `${name} must 404 for an anonymous caller`).toBe(404)
  }

  // And to a *different* signed-in user, not just to anonymous ones.
  await registerUser(request, uniqueUser('attacker'))
  for (const url of [
    `/api/recipes/${secret.id}/branches`,
    `/api/recipes/${secret.id}/commits?branchId=${secret.branchId}`,
    `/api/recipes/${secret.id}/diff?from=${older.id}&to=${newer.id}`,
  ]) {
    expect((await request.get(url)).status(), `${url} leaked to another account`).toBe(404)
  }
})

test('diff cannot borrow a public recipe id to read another recipe’s commits', async ({ request }) => {
  const { decoy, secretCommits } = await fixtures(request)
  const [newer, older] = secretCommits
  await request.post('/auth/logout')

  // The original hole: a public recipe in the path, someone else's commit ids in the query.
  // The path parameter was never used to scope them.
  const res = await request.get(`/api/recipes/${decoy.id}/diff?from=${older.id}&to=${newer.id}`)
  expect(res.status(), 'commit ids must be scoped to the recipe in the path').toBe(404)

  const body = await res.text()
  expect(body).not.toContain('Guard this closely')
  expect(body).not.toContain('Mehl')
})

test('a public recipe still works, so the guards are not just refusing everything', async ({ request }) => {
  const owner = await registerUser(request, uniqueUser('publisher'))
  const flour = await createIngredient(request, 'Mehl, Weizen, hell')
  const recipe = await createRecipe(request, { title: 'Open Book', visibility: 'public' })
  await commitSnapshot(request, recipe.id, recipe.branchId, {
    message: 'first',
    ingredients: [{ ingredientId: flour, quantity: '100', unit: 'g', notes: null, sortOrder: 0 }],
    steps: [{ sortOrder: 1, content: 'Mix.', contentTranslations: {} }],
  })
  await commitSnapshot(request, recipe.id, recipe.branchId, {
    message: 'second',
    ingredients: [{ ingredientId: flour, quantity: '150', unit: 'g', notes: null, sortOrder: 0 }],
    steps: [{ sortOrder: 1, content: 'Mix well.', contentTranslations: {} }],
  })
  const commits = await (await request.get(`/api/recipes/${recipe.id}/commits?branchId=${recipe.branchId}`)).json()
  await request.post('/auth/logout')

  expect((await request.get(`/api/recipes/${recipe.id}/branches`)).ok()).toBeTruthy()
  expect((await request.get(`/api/recipes/${recipe.id}/commits?branchId=${recipe.branchId}`)).ok()).toBeTruthy()

  const diff = await request.get(`/api/recipes/${recipe.id}/diff?from=${commits[1].id}&to=${commits[0].id}`)
  expect(diff.ok(), 'a public recipe’s own diff must still resolve').toBeTruthy()
  expect((await diff.json()).ingredients.length).toBeGreaterThan(0)
  expect(owner.username).toBeTruthy()
})
