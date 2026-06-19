import { describe, test, expect } from 'vitest'
import { threeWayMerge } from '../../server/utils/merge'
import type { MergeSnapshot, MergeIngredient, MergeStep } from '../../server/utils/merge'

// ── Fixtures ─────────────────────────────────────────────────────

function ing(
  ingredientId: number,
  quantity: string,
  unit: 'g' | 'ml' | 'piece' | 'pinch' | 'tsp' | 'tbsp' = 'g',
  sortOrder = ingredientId,
  notes: string | null = null,
  ingredientName = `Ingredient ${ingredientId}`
): MergeIngredient {
  return { ingredientId, ingredientName, quantity, unit, sortOrder, notes }
}

function step(sortOrder: number, content: string): MergeStep {
  return { sortOrder, content }
}

function snap(ingredients: MergeIngredient[], steps: MergeStep[]): MergeSnapshot {
  return { ingredients, steps }
}

// ── Ingredient merges ────────────────────────────────────────────

describe('threeWayMerge — ingredients', () => {
  test('no changes from either side → result = base', () => {
    const base = snap([ing(1, '100.00'), ing(2, '200.00')], [])
    const result = threeWayMerge(base, base, base)
    expect(result.hasConflicts).toBe(false)
    expect(result.ingredients).toHaveLength(2)
  })

  test('source adds an ingredient, target unchanged → ingredient included', () => {
    const base = snap([ing(1, '100.00')], [])
    const source = snap([ing(1, '100.00'), ing(2, '50.00', 'ml')], [])
    const target = snap([ing(1, '100.00')], [])
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(false)
    expect(result.ingredients.map((i) => i.ingredientId)).toContain(2)
  })

  test('target adds an ingredient, source unchanged → ingredient included', () => {
    const base = snap([ing(1, '100.00')], [])
    const source = snap([ing(1, '100.00')], [])
    const target = snap([ing(1, '100.00'), ing(3, '30.00', 'piece')], [])
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(false)
    expect(result.ingredients.map((i) => i.ingredientId)).toContain(3)
  })

  test('both add different ingredients → both included, no conflict', () => {
    const base = snap([ing(1, '100.00')], [])
    const source = snap([ing(1, '100.00'), ing(2, '50.00')], [])
    const target = snap([ing(1, '100.00'), ing(3, '30.00')], [])
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(false)
    const ids = result.ingredients.map((i) => i.ingredientId)
    expect(ids).toContain(2)
    expect(ids).toContain(3)
  })

  test('source removes ingredient, target unchanged → ingredient removed', () => {
    const base = snap([ing(1, '100.00'), ing(2, '50.00')], [])
    const source = snap([ing(1, '100.00')], []) // removed 2
    const target = snap([ing(1, '100.00'), ing(2, '50.00')], [])
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(false)
    expect(result.ingredients.map((i) => i.ingredientId)).not.toContain(2)
  })

  test('target removes ingredient, source unchanged → ingredient removed', () => {
    const base = snap([ing(1, '100.00'), ing(2, '50.00')], [])
    const source = snap([ing(1, '100.00'), ing(2, '50.00')], [])
    const target = snap([ing(1, '100.00')], []) // removed 2
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(false)
    expect(result.ingredients.map((i) => i.ingredientId)).not.toContain(2)
  })

  test('source modifies ingredient, target unchanged → use source version', () => {
    const base = snap([ing(1, '100.00')], [])
    const source = snap([ing(1, '150.00')], []) // changed quantity
    const target = snap([ing(1, '100.00')], [])
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(false)
    expect(result.ingredients[0]!.quantity).toBe('150.00')
  })

  test('target modifies ingredient, source unchanged → use target version', () => {
    const base = snap([ing(1, '100.00')], [])
    const source = snap([ing(1, '100.00')], [])
    const target = snap([ing(1, '200.00')], []) // changed quantity
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(false)
    expect(result.ingredients[0]!.quantity).toBe('200.00')
  })

  test('both modify the same ingredient the same way → no conflict, apply change', () => {
    const base = snap([ing(1, '100.00')], [])
    const source = snap([ing(1, '150.00')], [])
    const target = snap([ing(1, '150.00')], []) // same change
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(false)
    expect(result.ingredients[0]!.quantity).toBe('150.00')
  })

  test('both modify the same ingredient differently → CONFLICT', () => {
    const base = snap([ing(1, '100.00')], [])
    const source = snap([ing(1, '150.00')], []) // changed to 150
    const target = snap([ing(1, '200.00')], []) // changed to 200 — different
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(true)
    expect(result.conflicts.some((c) => c.type === 'ingredient' && c.ingredientId === 1)).toBe(true)
  })

  test('source removes ingredient that target modified → CONFLICT', () => {
    const base = snap([ing(1, '100.00'), ing(2, '50.00')], [])
    const source = snap([ing(1, '100.00')], []) // removed 2
    const target = snap([ing(1, '100.00'), ing(2, '80.00')], []) // modified 2
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(true)
    expect(result.conflicts.some((c) => c.type === 'ingredient' && c.ingredientId === 2)).toBe(true)
  })

  test('target removes ingredient that source modified → CONFLICT', () => {
    const base = snap([ing(1, '100.00'), ing(2, '50.00')], [])
    const source = snap([ing(1, '100.00'), ing(2, '80.00')], []) // modified 2
    const target = snap([ing(1, '100.00')], []) // removed 2
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(true)
    expect(result.conflicts.some((c) => c.type === 'ingredient' && c.ingredientId === 2)).toBe(true)
  })

  test('both remove the same ingredient → no conflict, ingredient gone', () => {
    const base = snap([ing(1, '100.00'), ing(2, '50.00')], [])
    const source = snap([ing(1, '100.00')], [])
    const target = snap([ing(1, '100.00')], [])
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(false)
    expect(result.ingredients.map((i) => i.ingredientId)).not.toContain(2)
  })

  test('source adds ingredient that already exists in target (same data) → no conflict', () => {
    const base = snap([ing(1, '100.00')], [])
    const source = snap([ing(1, '100.00'), ing(2, '50.00')], [])
    const target = snap([ing(1, '100.00'), ing(2, '50.00')], []) // same addition
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(false)
    const id2Count = result.ingredients.filter((i) => i.ingredientId === 2).length
    expect(id2Count).toBe(1) // not duplicated
  })

  test('source adds ingredient that target also added (different data) → CONFLICT', () => {
    const base = snap([ing(1, '100.00')], [])
    const source = snap([ing(1, '100.00'), ing(2, '50.00')], [])
    const target = snap([ing(1, '100.00'), ing(2, '75.00')], []) // different quantity
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(true)
    expect(result.conflicts.some((c) => c.type === 'ingredient' && c.ingredientId === 2)).toBe(true)
  })
})

// ── Step merges ──────────────────────────────────────────────────

describe('threeWayMerge — steps', () => {
  test('no changes from either side → result = base', () => {
    const base = snap([], [step(1, 'Preheat oven'), step(2, 'Mix flour')])
    const result = threeWayMerge(base, base, base)
    expect(result.hasConflicts).toBe(false)
    expect(result.steps).toHaveLength(2)
  })

  test('source adds a step, target unchanged → step included', () => {
    const base = snap([], [step(1, 'Preheat oven')])
    const source = snap([], [step(1, 'Preheat oven'), step(2, 'Mix flour')])
    const target = snap([], [step(1, 'Preheat oven')])
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(false)
    expect(result.steps.find((s) => s.sortOrder === 2)?.content).toBe('Mix flour')
  })

  test('target adds a step, source unchanged → step included', () => {
    const base = snap([], [step(1, 'Preheat oven')])
    const source = snap([], [step(1, 'Preheat oven')])
    const target = snap([], [step(1, 'Preheat oven'), step(2, 'Add sugar')])
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(false)
    expect(result.steps.find((s) => s.sortOrder === 2)?.content).toBe('Add sugar')
  })

  test('source modifies step, target unchanged → use source version', () => {
    const base = snap([], [step(1, 'Preheat to 180°C')])
    const source = snap([], [step(1, 'Preheat to 200°C')])
    const target = snap([], [step(1, 'Preheat to 180°C')])
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(false)
    expect(result.steps[0]!.content).toBe('Preheat to 200°C')
  })

  test('target modifies step, source unchanged → use target version', () => {
    const base = snap([], [step(1, 'Preheat to 180°C')])
    const source = snap([], [step(1, 'Preheat to 180°C')])
    const target = snap([], [step(1, 'Preheat to 160°C fan')])
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(false)
    expect(result.steps[0]!.content).toBe('Preheat to 160°C fan')
  })

  test('both modify the same step the same way → no conflict', () => {
    const base = snap([], [step(1, 'Preheat to 180°C')])
    const source = snap([], [step(1, 'Preheat to 200°C')])
    const target = snap([], [step(1, 'Preheat to 200°C')])
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(false)
    expect(result.steps[0]!.content).toBe('Preheat to 200°C')
  })

  test('both modify the same step differently → CONFLICT', () => {
    const base = snap([], [step(1, 'Preheat to 180°C')])
    const source = snap([], [step(1, 'Preheat to 200°C')])
    const target = snap([], [step(1, 'Preheat to 160°C fan')])
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(true)
    expect(result.conflicts.some((c) => c.type === 'step' && c.stepSortOrder === 1)).toBe(true)
  })

  test('source removes step, target unchanged → step not in result', () => {
    const base = snap([], [step(1, 'Preheat oven'), step(2, 'Mix flour')])
    const source = snap([], [step(1, 'Preheat oven')]) // removed step 2
    const target = snap([], [step(1, 'Preheat oven'), step(2, 'Mix flour')])
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(false)
    expect(result.steps.find((s) => s.sortOrder === 2)).toBeUndefined()
  })

  test('source removes step that target modified → CONFLICT', () => {
    const base = snap([], [step(1, 'Preheat oven'), step(2, 'Mix flour')])
    const source = snap([], [step(1, 'Preheat oven')]) // removed step 2
    const target = snap([], [step(1, 'Preheat oven'), step(2, 'Sift flour carefully')]) // modified step 2
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(true)
    expect(result.conflicts.some((c) => c.type === 'step' && c.stepSortOrder === 2)).toBe(true)
  })

  test('both source and target add steps at different positions → both included', () => {
    const base = snap([], [step(1, 'Preheat oven')])
    const source = snap([], [step(1, 'Preheat oven'), step(2, 'Add butter')])
    const target = snap([], [step(1, 'Preheat oven'), step(3, 'Add sugar')])
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(false)
    const sortOrders = result.steps.map((s) => s.sortOrder)
    expect(sortOrders).toContain(2)
    expect(sortOrders).toContain(3)
  })
})

// ── Combined merge ───────────────────────────────────────────────

describe('threeWayMerge — combined', () => {
  test('source adds ingredient and modifies a step, target unchanged → clean merge', () => {
    const base = snap([ing(1, '100.00')], [step(1, 'Preheat oven')])
    const source = snap([ing(1, '100.00'), ing(2, '50.00')], [step(1, 'Preheat to 200°C')])
    const target = snap([ing(1, '100.00')], [step(1, 'Preheat oven')])
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(false)
    expect(result.ingredients.map((i) => i.ingredientId)).toContain(2)
    expect(result.steps[0]!.content).toBe('Preheat to 200°C')
  })

  test('ingredient conflict + clean step merge → hasConflicts=true, step still merged correctly', () => {
    const base = snap([ing(1, '100.00')], [step(1, 'Preheat oven')])
    const source = snap([ing(1, '150.00')], [step(1, 'Preheat oven'), step(2, 'Mix')])
    const target = snap([ing(1, '200.00')], [step(1, 'Preheat oven')]) // ingredient conflict
    const result = threeWayMerge(base, source, target)
    expect(result.hasConflicts).toBe(true)
    expect(result.conflicts.some((c) => c.type === 'ingredient')).toBe(true)
    // Even with conflict, non-conflicting step changes are returned for display
    expect(result.steps.find((s) => s.sortOrder === 2)).toBeDefined()
  })
})
