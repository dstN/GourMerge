import { test, expect } from '@playwright/test'
import { resetRateLimits } from '../support/db'
import { uniqueUser, registerUser, createRecipe, createIngredient, commitSnapshot } from '../support/api'

/**
 * Recipe discussions — the authorization matrix and the scoping rules.
 *
 * This is the first feature where an arbitrary signed-in user writes text into somebody
 * else's page, so the things worth proving are not "does a comment appear". They are:
 *
 * - a private recipe's threads are invisible, and the endpoint 404s rather than 403s (a 403
 *   confirms the id exists, and recipe ids are sequential);
 * - only the author may edit their own words, while the recipe owner may still moderate;
 * - a `commitId` is scoped to the recipe before it is trusted, or `?commitId=` becomes a
 *   way to read threads hanging off a stranger's private snapshot;
 * - a resolved thread stops accepting replies, or "resolved" means nothing.
 */
test.describe.configure({ mode: 'serial' })
test.beforeEach(async () => {
  await resetRateLimits()
})

test('anyone signed in can open a thread; guests cannot', async ({ request }) => {
  const owner = await registerUser(request)
  const recipe = await createRecipe(request, { title: 'Talkable Tart', visibility: 'public' })
  await request.post('/auth/logout')

  // Guest: may read, may not write.
  expect((await request.get(`/api/recipes/${recipe.id}/discussions`)).ok()).toBeTruthy()
  expect(
    (await request.post(`/api/recipes/${recipe.id}/discussions`, { data: { title: 'Hi there', body: 'x' } })).status()
  ).toBe(401)

  const stranger = await registerUser(request, uniqueUser('stranger'))
  const created = await request.post(`/api/recipes/${recipe.id}/discussions`, {
    data: { title: 'Tried it with oat milk', body: 'Worked well, slightly sweeter.', category: 'idea' },
  })
  expect(created.status()).toBe(201)
  const { id } = await created.json()

  const list = await (await request.get(`/api/recipes/${recipe.id}/discussions`)).json()
  expect(list).toHaveLength(1)
  expect(list[0].authorUsername).toBe(stranger.username)
  expect(list[0].category).toBe('idea')
  expect(list[0].status).toBe('open')
  expect(list[0].comments).toEqual([])
  // The owner is not the author, and the payload must say so plainly enough for the UI to
  // decide what to offer.
  expect(list[0].authorUsername).not.toBe(owner.username)
  expect(id).toBeGreaterThan(0)
})

test('only the author edits the text; the owner may still resolve and delete', async ({ request }) => {
  const owner = await registerUser(request)
  const recipe = await createRecipe(request, { visibility: 'public' })
  await request.post('/auth/logout')

  await registerUser(request, uniqueUser('author'))
  const { id } = await (
    await request.post(`/api/recipes/${recipe.id}/discussions`, {
      data: { title: 'Salt seems high', body: 'Halved it and it was better.', category: 'issue' },
    })
  ).json()
  await request.post('/auth/logout')

  // A third party may do neither.
  await registerUser(request, uniqueUser('bystander'))
  expect(
    (await request.patch(`/api/recipes/${recipe.id}/discussions/${id}`, { data: { body: 'edited' } })).status()
  ).toBe(403)
  expect(
    (await request.patch(`/api/recipes/${recipe.id}/discussions/${id}`, { data: { status: 'resolved' } })).status()
  ).toBe(403)
  expect((await request.delete(`/api/recipes/${recipe.id}/discussions/${id}`)).status()).toBe(403)
  await request.post('/auth/logout')

  // The recipe owner may moderate — resolve and delete — but not rewrite the text. That
  // split is the point: moderation is not authorship.
  await request.post('/auth/login', { data: { email: owner.email, password: owner.password } })
  expect(
    (await request.patch(`/api/recipes/${recipe.id}/discussions/${id}`, { data: { body: 'not mine' } })).status()
  ).toBe(403)
  expect(
    (await request.patch(`/api/recipes/${recipe.id}/discussions/${id}`, { data: { status: 'resolved' } })).ok()
  ).toBeTruthy()

  // A resolved thread takes no more replies — otherwise the state is decorative.
  expect(
    (
      await request.post(`/api/recipes/${recipe.id}/discussions/${id}/comments`, { data: { body: 'still talking' } })
    ).status()
  ).toBe(422)

  expect((await request.delete(`/api/recipes/${recipe.id}/discussions/${id}`)).ok()).toBeTruthy()
  expect(await (await request.get(`/api/recipes/${recipe.id}/discussions`)).json()).toHaveLength(0)
})

test('replies nest under their thread and cascade with it', async ({ request }) => {
  await registerUser(request)
  const recipe = await createRecipe(request, { visibility: 'public' })
  const { id } = await (
    await request.post(`/api/recipes/${recipe.id}/discussions`, {
      data: { title: 'Serving size', body: 'Is 4 right?' },
    })
  ).json()

  expect(
    (
      await request.post(`/api/recipes/${recipe.id}/discussions/${id}/comments`, { data: { body: 'Closer to 3.' } })
    ).status()
  ).toBe(201)

  const [thread] = await (await request.get(`/api/recipes/${recipe.id}/discussions`)).json()
  expect(thread.comments).toHaveLength(1)
  expect(thread.comments[0].body).toBe('Closer to 3.')

  await request.delete(`/api/recipes/${recipe.id}/discussions/${id}`)
  expect(await (await request.get(`/api/recipes/${recipe.id}/discussions`)).json()).toHaveLength(0)
})

test('a private recipe 404s rather than 403s, for reading and for writing', async ({ request }) => {
  await registerUser(request)
  const recipe = await createRecipe(request, { title: 'Secret Sauce', visibility: 'private' })
  await request.post('/auth/logout')

  await registerUser(request, uniqueUser('nosy'))
  // 404 both ways. A 403 would confirm the id exists, and ids are sequential integers.
  expect((await request.get(`/api/recipes/${recipe.id}/discussions`)).status()).toBe(404)
  expect(
    (await request.post(`/api/recipes/${recipe.id}/discussions`, { data: { title: 'Let me in', body: 'x' } })).status()
  ).toBe(404)
})

test('a commit-scoped thread is scoped to its own recipe', async ({ request }) => {
  const owner = await registerUser(request)
  const flour = await createIngredient(request, 'Mehl, Weizen, hell')

  const mine = await createRecipe(request, { title: 'Mine', visibility: 'public' })
  await commitSnapshot(request, mine.id, mine.branchId, {
    message: 'base',
    ingredients: [{ ingredientId: flour, quantity: '100', unit: 'g', notes: null, sortOrder: 0 }],
    steps: [{ sortOrder: 1, content: 'Mix.', contentTranslations: {} }],
  })
  const myCommits = await (await request.get(`/api/recipes/${mine.id}/commits?branchId=${mine.branchId}`)).json()
  const myCommitId = myCommits[0].id

  const other = await createRecipe(request, { title: 'Other', visibility: 'public' })

  // A commit belongs to a branch, which belongs to a recipe — `recipe_commits` has no
  // `recipe_id`. An unchecked `?commitId=` would therefore reach across recipes.
  expect((await request.get(`/api/recipes/${other.id}/discussions?commitId=${myCommitId}`)).status()).toBe(404)
  expect(
    (
      await request.post(`/api/recipes/${other.id}/discussions`, {
        data: { title: 'Wrong recipe', body: 'x', commitId: myCommitId },
      })
    ).status()
  ).toBe(404)

  // On its own recipe it works, and the two scopes are separate lists.
  const commitThread = await request.post(`/api/recipes/${mine.id}/discussions`, {
    data: { title: 'This version was the good one', body: 'Before the salt went up.', commitId: myCommitId },
  })
  expect(commitThread.status()).toBe(201)
  await request.post(`/api/recipes/${mine.id}/discussions`, { data: { title: 'About the dish', body: 'Lovely.' } })

  const recipeLevel = await (await request.get(`/api/recipes/${mine.id}/discussions`)).json()
  const commitLevel = await (await request.get(`/api/recipes/${mine.id}/discussions?commitId=${myCommitId}`)).json()
  const everything = await (await request.get(`/api/recipes/${mine.id}/discussions?commitId=all`)).json()

  expect(recipeLevel).toHaveLength(1)
  expect(recipeLevel[0].commitId).toBeNull()
  expect(commitLevel).toHaveLength(1)
  expect(commitLevel[0].commitId).toBe(myCommitId)
  expect(everything).toHaveLength(2)
  expect(owner.username).toBeTruthy()
})

test('validation rejects an empty body, an over-long title and unknown keys', async ({ request }) => {
  await registerUser(request)
  const recipe = await createRecipe(request, { visibility: 'public' })

  for (const data of [
    { title: 'ok title', body: '' },
    { title: 'xx', body: 'too short a title' },
    { title: 'x'.repeat(201), body: 'fine' },
    { title: 'ok title', body: 'fine', category: 'rant' },
    // `.strict()` on the schema: an unknown key is a rejected request, not a silently
    // ignored one — that is what stops a future column being mass-assignable.
    { title: 'ok title', body: 'fine', status: 'resolved' },
  ]) {
    expect(
      (await request.post(`/api/recipes/${recipe.id}/discussions`, { data })).status(),
      `should have rejected ${JSON.stringify(data)}`
    ).toBe(422)
  }
})
