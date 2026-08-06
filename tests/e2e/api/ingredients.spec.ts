import { test, expect } from '@playwright/test'
import { resetRateLimits } from '../support/db'
import { registerUser } from '../support/api'

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
  const name = `Spec Zutat ${Date.now()}`

  const res = await request.post('/api/ingredients', {
    data: {
      name,
      nameTranslations: { de: name, en: 'Spec ingredient', fr: 'Ingrédient spec', it: 'Ingrediente spec' },
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
  const found = await (await request.get('/api/ingredients?q=Spec%20ingredient&locale=en')).json()
  expect(found.length).toBeGreaterThan(0)
  const hit = found.find((r: { id: number }) => r.id === body.id)
  expect(hit, 'the new ingredient must be searchable by translation').toBeTruthy()
  expect(hit.localeName).toBe('Spec ingredient')
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
