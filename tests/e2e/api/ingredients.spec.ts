import { test, expect } from '@playwright/test'
import { resetRateLimits } from '../support/db'
import { registerUser, uniqueUser } from '../support/api'

/**
 * The master-ingredient API, as the new-ingredient dialog uses it.
 *
 * Creating an ingredient used to send a bare name, so the row arrived with no
 * translations, no category and no nutrition — findable only in whichever language it
 * happened to be typed in, and silently dragging every recipe's nutrition totals toward
 * zero. These specs pin the three things that fix depends on.
 */
test.beforeEach(async () => {
  await resetRateLimits()
})

test('creating an ingredient stores translations, category and nutrition', async ({ request }) => {
  await registerUser(request)
  const suffix = Date.now()
  const name = `Spec Zutat ${suffix}`
  // Unique per run, not just `name`: the search endpoint has no ORDER BY and a default
  // `limit=10`, so a fixed English translation reused across many local test runs
  // accumulates rows and can push the one just created off the first page.
  const enName = `Spec ingredient ${suffix}`

  const res = await request.post('/api/ingredients', {
    data: {
      name,
      nameTranslations: { de: name, en: enName, fr: 'Ingrédient spec', it: 'Ingrediente spec' },
      category: 'baking',
      // `0,5` on purpose: a German decimal comma must not silently become NaN or 5.
      nutrition: { energyKcal100g: '387', fat100g: '0,5', carbs100g: '99.8', protein100g: '0', fiber100g: '0' },
    },
  })
  expect(res.status()).toBe(201)
  const body = await res.json()
  expect(body.created).toBe(true)
  expect(body.hasNutrition).toBe(true)

  // Findable by its ENGLISH name although the canonical name is German — the entire
  // reason for collecting translations at creation time rather than never.
  const found = await (await request.get(`/api/ingredients?q=${encodeURIComponent(enName)}&locale=en`)).json()
  expect(found.length).toBeGreaterThan(0)
  const hit = found.find((r: { id: number }) => r.id === body.id)
  expect(hit, 'the new ingredient must be searchable by translation').toBeTruthy()
  expect(hit.localeName).toBe(enName)
  expect(hit.hasNutrition).toBe(true)
  expect(hit.nutrition.kcal).toBe(387)
  expect(hit.nutrition.fat, 'decimal comma must parse').toBeCloseTo(0.5, 2)
})

test('nutrition is only stored when an energy value is given', async ({ request }) => {
  await registerUser(request)

  // A row of all-nulls would be worse than no row: `computeNutrition` treats a present
  // row with `energyKcal100g === null` as covered, so it would claim coverage the data
  // does not have instead of reporting the ingredient as missing.
  const res = await request.post('/api/ingredients', {
    data: { name: `Spec ohne Energie ${Date.now()}`, nutrition: { protein100g: '5' } },
  })
  expect(res.status()).toBe(201)
  expect((await res.json()).hasNutrition).toBe(false)
})

test('a negative or absurd nutrition value is rejected', async ({ request }) => {
  await registerUser(request)

  for (const bad of [{ energyKcal100g: '-1' }, { energyKcal100g: '999999' }, { fat100g: 'abc' }]) {
    const res = await request.post('/api/ingredients', {
      data: { name: `Spec ungültig ${Date.now()}${Math.random()}`, nutrition: bad },
    })
    expect(res.status(), `${JSON.stringify(bad)} should not be accepted`).toBe(422)
  }
})

test('dedup by name is case-insensitive and returns the original row', async ({ request }) => {
  await registerUser(request)
  const name = `Spec Dedup ${Date.now()}`

  const first = await (await request.post('/api/ingredients', { data: { name } })).json()
  const again = await request.post('/api/ingredients', { data: { name: name.toUpperCase() } })

  expect(again.status()).toBe(200)
  const second = await again.json()
  expect(second.created).toBe(false)
  expect(second.id).toBe(first.id)
})

test('the categories endpoint feeds the picker with existing values', async ({ request }) => {
  const res = await request.get('/api/ingredients/categories')
  expect(res.status()).toBe(200)

  const categories = await res.json()
  expect(Array.isArray(categories)).toBe(true)
  // The Swiss BLV seed populates these; a free-text field instead of a picker is what
  // fragments them into "Gemüse" / "gemuese" / "Vegetables".
  expect(categories.length).toBeGreaterThan(0)
  expect(categories.every((c: unknown) => typeof c === 'string' && c.length > 0)).toBe(true)
  expect(new Set(categories).size, 'must be distinct').toBe(categories.length)
})

test('creating an ingredient requires a session', async ({ request }) => {
  const res = await request.post('/api/ingredients', { data: { name: 'Spec anonymous' } })
  expect(res.status()).toBe(401)
})

/**
 * Editing: only the creator, never the Swiss BLV rows. `created_by` is the one signal for
 * this — `ingredient_nutrition.source` almost works but a user ingredient with no nutrition
 * supplied has no nutrition row to check at all.
 */
test.describe('editing', () => {
  test('the creator can edit name, category and nutrition; GET reflects canEdit', async ({ request }) => {
    const creator = await registerUser(request)
    const created = await (await request.post('/api/ingredients', { data: { name: `Spec Edit ${Date.now()}` } })).json()

    const ownDetail = await (await request.get(`/api/ingredients/${created.id}`)).json()
    expect(ownDetail.canEdit).toBe(true)

    const patched = await request.patch(`/api/ingredients/${created.id}`, {
      data: {
        name: 'Spec Edited Name',
        nameTranslations: { en: 'Edited' },
        category: 'condiment',
        nutrition: { energyKcal100g: '120', protein100g: '3' },
      },
    })
    expect(patched.status()).toBe(200)

    const updated = await (await request.get(`/api/ingredients/${created.id}`)).json()
    expect(updated.name).toBe('Spec Edited Name')
    expect(updated.category).toBe('condiment')
    expect(updated.energyKcal100g).toBe('120.00')
    expect(creator.username).toBeTruthy()
  })

  test('clearing the energy value removes the nutrition row rather than zeroing it', async ({ request }) => {
    await registerUser(request)
    const created = await (
      await request.post('/api/ingredients', {
        data: { name: `Spec Clear ${Date.now()}`, nutrition: { energyKcal100g: '50' } },
      })
    ).json()
    expect(created.hasNutrition).toBe(true)

    await request.patch(`/api/ingredients/${created.id}`, { data: { nutrition: { energyKcal100g: '' } } })

    const after = await (await request.get(`/api/ingredients/${created.id}`)).json()
    expect(after.energyKcal100g).toBeNull()
  })

  test('a stranger cannot edit someone else’s ingredient — 404, not 403', async ({ request }) => {
    await registerUser(request, uniqueUser('ingowner'))
    const created = await (
      await request.post('/api/ingredients', { data: { name: `Spec Owned ${Date.now()}` } })
    ).json()

    await registerUser(request, uniqueUser('ingstranger'))
    const res = await request.patch(`/api/ingredients/${created.id}`, { data: { name: 'Hijacked' } })
    expect(res.status()).toBe(404)

    const detail = await (await request.get(`/api/ingredients/${created.id}`)).json()
    expect(detail.canEdit).toBe(false)
    expect(detail.name, 'the stranger’s attempt must not have applied').not.toBe('Hijacked')
  })

  test('a Swiss BLV ingredient (no creator) cannot be edited by anyone', async ({ request }) => {
    await registerUser(request)
    // Seeded rows exist without ever going through POST /api/ingredients — found via the
    // autocomplete rather than assumed to sit at a specific id.
    const found = await (await request.get('/api/ingredients?q=Karotte&locale=de')).json()
    const seeded = found[0]
    expect(seeded, 'the Swiss BLV seed must contain at least one match').toBeTruthy()

    const res = await request.patch(`/api/ingredients/${seeded.id}`, { data: { name: 'Hijacked' } })
    expect(res.status()).toBe(404)
  })

  test('editing requires a session', async ({ request }) => {
    const res = await request.patch('/api/ingredients/1', { data: { name: 'x' } })
    expect(res.status()).toBe(401)
  })
})
