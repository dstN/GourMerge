import { describe, test, expect } from 'vitest'
import {
  computeNutritionTotals,
  perServing,
  type IngredientNutritionRow,
  type CommitIngredientInput,
} from '../../server/utils/nutrition'

// ── Fixtures ─────────────────────────────────────────────────────

function nutrition(overrides: Partial<IngredientNutritionRow> & { ingredientId: number }): IngredientNutritionRow {
  return {
    energyKcal100g: '100',
    protein100g: '10',
    carbs100g: '20',
    sugars100g: '8',
    fat100g: '5',
    saturatedFat100g: '1',
    fiber100g: '2',
    salt100g: '0.5',
    densityGPerMl: null,
    gramsPerPiece: null,
    micros: null,
    ...overrides,
  }
}

function map(rows: IngredientNutritionRow[]): Map<number, IngredientNutritionRow> {
  return new Map(rows.map((r) => [r.ingredientId, r]))
}

function ci(ingredientId: number, quantity: string, unit: CommitIngredientInput['unit']): CommitIngredientInput {
  return { ingredientId, quantity, unit }
}

// ── computeNutritionTotals ───────────────────────────────────────

describe('computeNutritionTotals', () => {
  test('grams: scales per-100g values by quantity/100', () => {
    const totals = computeNutritionTotals([ci(1, '200', 'g')], map([nutrition({ ingredientId: 1 })]))
    expect(totals.kcal).toBe(200) // 100 kcal/100g × 2
    expect(totals.protein).toBe(20)
    expect(totals.sugars).toBe(16) // 8g/100g × 2
    expect(totals.salt).toBe(1) // 0.5g/100g × 2
    expect(totals.isApproximate).toBe(false)
    expect(totals.coveredCount).toBe(1)
    expect(totals.missingCount).toBe(0)
  })

  test('ml with density converts to grams precisely (not approximate)', () => {
    const totals = computeNutritionTotals(
      [ci(1, '100', 'ml')],
      map([nutrition({ ingredientId: 1, densityGPerMl: '0.5' })])
    )
    expect(totals.kcal).toBe(50) // 100ml × 0.5 = 50g → 50 kcal
    expect(totals.isApproximate).toBe(false)
  })

  test('ml without density falls back to water (1.0) and marks approximate', () => {
    const totals = computeNutritionTotals([ci(1, '100', 'ml')], map([nutrition({ ingredientId: 1 })]))
    expect(totals.kcal).toBe(100)
    expect(totals.isApproximate).toBe(true)
  })

  test('piece with gramsPerPiece is exact', () => {
    const totals = computeNutritionTotals(
      [ci(1, '2', 'piece')],
      map([nutrition({ ingredientId: 1, gramsPerPiece: 50 })])
    )
    expect(totals.kcal).toBe(100) // 2 × 50g = 100g → 100 kcal
    expect(totals.isApproximate).toBe(false)
  })

  test('piece without gramsPerPiece falls back to 100g and marks approximate', () => {
    const totals = computeNutritionTotals([ci(1, '1', 'piece')], map([nutrition({ ingredientId: 1 })]))
    expect(totals.kcal).toBe(100)
    expect(totals.isApproximate).toBe(true)
  })

  test('tsp and tbsp convert via ml constants', () => {
    const tsp = computeNutritionTotals([ci(1, '1', 'tsp')], map([nutrition({ ingredientId: 1 })]))
    // 1 tsp ≈ 4.92892 ml × 1.0 density → ~4.93 g → ~4.93 kcal
    expect(tsp.kcal).toBeCloseTo(4.93, 1)
    const tbsp = computeNutritionTotals([ci(1, '1', 'tbsp')], map([nutrition({ ingredientId: 1 })]))
    expect(tbsp.kcal).toBeCloseTo(14.79, 1)
  })

  test('pinch uses a tiny fixed gram weight (approximate)', () => {
    const totals = computeNutritionTotals([ci(1, '1', 'pinch')], map([nutrition({ ingredientId: 1 })]))
    expect(totals.kcal).toBeCloseTo(0.3, 5) // 0.3g × 100kcal/100g
    expect(totals.isApproximate).toBe(true)
  })

  test('missing nutrition row is counted and listed, marks approximate', () => {
    const totals = computeNutritionTotals(
      [{ ingredientId: 9, quantity: '100', unit: 'g', ingredientName: 'Vanilla Sugar' }],
      map([])
    )
    expect(totals.missingCount).toBe(1)
    expect(totals.coveredCount).toBe(0)
    expect(totals.isApproximate).toBe(true)
    expect(totals.missingIngredients).toContain('Vanilla Sugar')
    expect(totals.kcal).toBe(0)
  })

  test('aggregates micros scaled by factor', () => {
    const totals = computeNutritionTotals(
      [ci(1, '200', 'g')],
      map([nutrition({ ingredientId: 1, micros: { vitaminC: 10, iron: 2, ignored: null } })])
    )
    expect(totals.micros).toEqual({ vitaminC: 20, iron: 4 })
  })

  test('sums multiple ingredients', () => {
    const totals = computeNutritionTotals(
      [ci(1, '100', 'g'), ci(2, '100', 'g')],
      map([nutrition({ ingredientId: 1 }), nutrition({ ingredientId: 2, energyKcal100g: '50' })])
    )
    expect(totals.kcal).toBe(150)
    expect(totals.coveredCount).toBe(2)
  })
})

// ── perServing ───────────────────────────────────────────────────

describe('perServing', () => {
  test('divides totals by servings', () => {
    const totals = computeNutritionTotals([ci(1, '400', 'g')], map([nutrition({ ingredientId: 1 })]))
    const per = perServing(totals, 4)
    expect(per.kcal).toBe(100) // 400 kcal / 4
    expect(per.protein).toBe(10)
  })

  test('servings <= 0 returns totals unchanged', () => {
    const totals = computeNutritionTotals([ci(1, '400', 'g')], map([nutrition({ ingredientId: 1 })]))
    expect(perServing(totals, 0)).toBe(totals)
    expect(perServing(totals, -2)).toBe(totals)
  })

  test('divides micros too', () => {
    const totals = computeNutritionTotals(
      [ci(1, '200', 'g')],
      map([nutrition({ ingredientId: 1, micros: { iron: 4 } })])
    )
    // 4 (per 100g) × factor 2 (200g) = 8 total; / 2 servings = 4
    const per = perServing(totals, 2)
    expect(per.micros).toEqual({ iron: 4 })
  })
})
