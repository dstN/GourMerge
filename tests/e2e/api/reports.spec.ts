import { test, expect } from '@playwright/test'
import { resetRateLimits, dbQuery } from '../support/db'
import { registerUser, createRecipe, uniqueUser } from '../support/api'

/**
 * Reporting: recipes, users, discussion comments, images and ingredients, per the ROADMAP
 * spec — "reports are visible to the owner of the reported artefact and to an admin;
 * nothing is auto-hidden; the shipped moderation tools are the response."
 */
test.beforeEach(async () => {
  await resetRateLimits()
})

async function makeAdmin(username: string) {
  await dbQuery('UPDATE users SET is_admin = 1 WHERE username = ?', [username])
}

test('reporting is idempotent per (reporter, target), and 404s on a target you cannot see', async ({ request }) => {
  await registerUser(request, uniqueUser('reportowner'))
  const publicRecipe = await createRecipe(request, { visibility: 'public' })
  const privateRecipe = await createRecipe(request, { visibility: 'private' })

  const reporter = await registerUser(request, uniqueUser('reporter'))

  const first = await request.post('/api/reports', {
    data: { targetKind: 'recipe', targetId: publicRecipe.id, reason: 'spam' },
  })
  expect(first.status()).toBe(201)
  const firstBody = await first.json()
  expect(firstBody.alreadyReported).toBe(false)

  // Resubmitting must not create a second row or error — the unique index is the guard.
  const again = await request.post('/api/reports', {
    data: { targetKind: 'recipe', targetId: publicRecipe.id, reason: 'inappropriate' },
  })
  expect(again.status()).toBe(200)
  expect((await again.json()).alreadyReported).toBe(true)

  // A private recipe the reporter cannot see must 404, the same as any other endpoint —
  // reporting must not become a second way to confirm it exists.
  const hidden = await request.post('/api/reports', {
    data: { targetKind: 'recipe', targetId: privateRecipe.id, reason: 'spam' },
  })
  expect(hidden.status()).toBe(404)
  expect(reporter.username).toBeTruthy()
})

test('cannot report yourself, and reporting requires a session', async ({ request }) => {
  // Before any login: `request` is one shared cookie jar for the whole test, so this has
  // to run first or it would inherit the session from the `registerUser` call below.
  const anon = await request.post('/api/reports', { data: { targetKind: 'recipe', targetId: 1, reason: 'spam' } })
  expect(anon.status()).toBe(401)

  const user = await registerUser(request)
  const [{ id: userId }] = await dbQuery<{ id: number }>('SELECT id FROM users WHERE username = ?', [user.username])
  const self = await request.post('/api/reports', {
    data: { targetKind: 'user', targetId: userId, reason: 'harassment' },
  })
  expect(self.status()).toBe(422)
})

test('a recipe owner sees a report on their recipe via /mine; a reported user does not', async ({ request }) => {
  const owner = await registerUser(request, uniqueUser('mineowner'))
  const recipe = await createRecipe(request, { visibility: 'public' })
  const [ownerId] = await dbQuery<{ id: number }>('SELECT id FROM users WHERE username = ?', [owner.username])

  await registerUser(request, uniqueUser('minereporter'))
  await request.post('/api/reports', { data: { targetKind: 'recipe', targetId: recipe.id, reason: 'copyright' } })
  await request.post('/api/reports', { data: { targetKind: 'user', targetId: ownerId!.id, reason: 'harassment' } })

  // Back to the owner's own session.
  await request.post('/auth/login', { data: { identifier: owner.email, password: owner.password } })
  const mine = await (await request.get('/api/reports/mine')).json()

  expect(mine.some((r: { targetKind: string; targetId: number }) => r.targetKind === 'recipe' && r.targetId === recipe.id)).toBe(
    true
  )
  // The 'user' report is deliberately absent — a reported person is not told they were
  // reported, only an admin sees that one.
  expect(mine.some((r: { targetKind: string }) => r.targetKind === 'user')).toBe(false)
})

test('only an admin can list or act on /api/admin/reports', async ({ request }) => {
  await registerUser(request, uniqueUser('adminrptowner'))
  const recipe = await createRecipe(request, { title: 'Admin Report Target Recipe', visibility: 'public' })
  await registerUser(request, uniqueUser('adminrptreporter'))
  const created = await (
    await request.post('/api/reports', { data: { targetKind: 'recipe', targetId: recipe.id, reason: 'spam' } })
  ).json()

  // Still signed in as the reporter — not an admin.
  const forbidden = await request.get('/api/admin/reports')
  expect(forbidden.status()).toBe(403)
  expect((await request.patch(`/api/admin/reports/${created.id}`, { data: { status: 'dismissed' } })).status()).toBe(
    403
  )

  const admin = await registerUser(request, uniqueUser('adminrptadmin'))
  await makeAdmin(admin.username)

  const list = await (await request.get('/api/admin/reports')).json()
  const found = list.find((r: { id: number }) => r.id === created.id)
  expect(found, 'the report must be visible to the admin').toBeTruthy()
  expect(found.target.label).toBe('Admin Report Target Recipe')
  expect(found.reporterUsername).toBeTruthy()

  const patched = await request.patch(`/api/admin/reports/${created.id}`, { data: { status: 'dismissed' } })
  expect(patched.status()).toBe(200)

  const openList = await (await request.get('/api/admin/reports')).json()
  expect(openList.some((r: { id: number }) => r.id === created.id), 'moved out of the open queue').toBe(false)

  const dismissedList = await (await request.get('/api/admin/reports?status=dismissed')).json()
  expect(dismissedList.some((r: { id: number; status: string }) => r.id === created.id && r.status === 'dismissed')).toBe(
    true
  )
})

test('deleting the reported recipe auto-closes its open report', async ({ request }) => {
  const owner = await registerUser(request, uniqueUser('autoowner'))
  const recipe = await createRecipe(request, { visibility: 'public' })

  const admin = await registerUser(request, uniqueUser('autoadmin'))
  await makeAdmin(admin.username)
  const created = await (
    await request.post('/api/reports', { data: { targetKind: 'recipe', targetId: recipe.id, reason: 'spam' } })
  ).json()

  // Still the admin session — confirm it is open before the delete.
  const beforeDelete = await (await request.get('/api/admin/reports')).json()
  expect(beforeDelete.some((r: { id: number }) => r.id === created.id)).toBe(true)

  // Back to the owner to delete their own recipe — `registerUser`'s returned password is
  // what makes logging back into a specific earlier account possible in this test.
  await request.post('/auth/login', { data: { identifier: owner.email, password: owner.password } })
  expect((await request.delete(`/api/recipes/${recipe.id}`)).ok()).toBeTruthy()

  // Deleting the recipe is the moderation response — the report is closed, not left open
  // against something that no longer exists.
  await request.post('/auth/login', { data: { identifier: admin.email, password: admin.password } })
  const afterDelete = await (await request.get('/api/admin/reports?status=actioned')).json()
  expect(afterDelete.some((r: { id: number; status: string }) => r.id === created.id && r.status === 'actioned')).toBe(
    true
  )
})
