import { describe, it, expect } from 'vitest'
import { computeIngredientDiff, computeTextDiff, computeStepsDiff, computeCommitDiff } from '../../server/utils/diff'
import type { CommitIngredient, CommitStep } from '../../shared/types'

function makeIngredient(
  id: number,
  quantity: number,
  unit: CommitIngredient['unit'] = 'g',
  name = `Ingredient ${id}`
): CommitIngredient {
  return {
    id: id * 100,
    commitId: 1,
    ingredientId: id,
    ingredient: { id, name, nameTranslations: {}, category: null, createdAt: '' },
    quantity,
    unit,
    notes: null,
    sortOrder: id,
  }
}

function makeStep(sortOrder: number, content: string): CommitStep {
  return { id: sortOrder * 10, commitId: 1, sortOrder, content }
}

// ─────────────────────────────────────────────────────────────────
// Ingredient Diff
// ─────────────────────────────────────────────────────────────────

describe('computeIngredientDiff', () => {
  it('returns empty array for identical snapshots', () => {
    const ing = [makeIngredient(1, 100, 'g')]
    const result = computeIngredientDiff(ing, ing)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('unchanged')
  })

  it('detects added ingredient', () => {
    const old = [makeIngredient(1, 100)]
    const next = [makeIngredient(1, 100), makeIngredient(2, 50)]
    const result = computeIngredientDiff(old, next)
    const added = result.find((e) => e.type === 'added')
    expect(added).toBeDefined()
    expect(added!.ingredientId).toBe(2)
  })

  it('detects removed ingredient', () => {
    const old = [makeIngredient(1, 100), makeIngredient(2, 50)]
    const next = [makeIngredient(1, 100)]
    const result = computeIngredientDiff(old, next)
    const removed = result.find((e) => e.type === 'removed')
    expect(removed).toBeDefined()
    expect(removed!.ingredientId).toBe(2)
  })

  it('detects modified quantity', () => {
    const old = [makeIngredient(1, 100)]
    const next = [makeIngredient(1, 200)]
    const result = computeIngredientDiff(old, next)
    expect(result[0].type).toBe('modified')
    expect(result[0].changes).toContain('quantity')
    expect(result[0].oldQuantity).toBe(100)
    expect(result[0].newQuantity).toBe(200)
  })

  it('detects modified unit', () => {
    const old = [makeIngredient(1, 5, 'tsp')]
    const next = [makeIngredient(1, 5, 'tbsp')]
    const result = computeIngredientDiff(old, next)
    expect(result[0].type).toBe('modified')
    expect(result[0].changes).toContain('unit')
  })

  it('orders: removed → modified → unchanged → added', () => {
    const old = [makeIngredient(1, 100), makeIngredient(2, 50), makeIngredient(3, 30)]
    const next = [makeIngredient(1, 200), makeIngredient(3, 30), makeIngredient(4, 80)]
    const result = computeIngredientDiff(old, next)
    const types = result.map((r) => r.type)
    const firstRemoved = types.indexOf('removed')
    const firstModified = types.indexOf('modified')
    const firstAdded = types.indexOf('added')
    expect(firstRemoved).toBeLessThan(firstModified)
    expect(firstModified).toBeLessThan(firstAdded)
  })
})

// ─────────────────────────────────────────────────────────────────
// Text Diff
// ─────────────────────────────────────────────────────────────────

describe('computeTextDiff', () => {
  it('returns single equal segment for identical strings', () => {
    const result = computeTextDiff('hello', 'hello')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ type: 0, text: 'hello' })
  })

  it('returns insertion for new content', () => {
    const result = computeTextDiff('', 'new text')
    expect(result.some((s) => s.type === 1 && s.text === 'new text')).toBe(true)
  })

  it('returns deletion for removed content', () => {
    const result = computeTextDiff('old text', '')
    expect(result.some((s) => s.type === -1 && s.text === 'old text')).toBe(true)
  })

  it('handles partial changes', () => {
    const result = computeTextDiff('Add salt and pepper', 'Add salt and sugar')
    const types = new Set(result.map((s) => s.type))
    expect(types).toContain(-1) // deletion of "pepper"
    expect(types).toContain(1) // insertion of "sugar"
    expect(types).toContain(0) // unchanged "Add salt and "
  })
})

// ─────────────────────────────────────────────────────────────────
// Steps Diff
// ─────────────────────────────────────────────────────────────────

describe('computeStepsDiff', () => {
  it('returns unchanged for identical steps', () => {
    const steps = [makeStep(1, 'Preheat oven to 180°C')]
    const result = computeStepsDiff(steps, steps)
    expect(result[0].type).toBe('unchanged')
  })

  it('detects added step', () => {
    const old = [makeStep(1, 'Step 1')]
    const next = [makeStep(1, 'Step 1'), makeStep(2, 'Step 2')]
    const result = computeStepsDiff(old, next)
    expect(result.find((s) => s.type === 'added')?.sortOrder).toBe(2)
  })

  it('detects removed step', () => {
    const old = [makeStep(1, 'Step 1'), makeStep(2, 'Step 2')]
    const next = [makeStep(1, 'Step 1')]
    const result = computeStepsDiff(old, next)
    expect(result.find((s) => s.type === 'removed')?.sortOrder).toBe(2)
  })

  it('detects modified step with text diff segments', () => {
    const old = [makeStep(1, 'Add salt')]
    const next = [makeStep(1, 'Add salt and pepper')]
    const result = computeStepsDiff(old, next)
    expect(result[0].type).toBe('modified')
    expect(result[0].segments).toBeDefined()
    expect(result[0].segments!.length).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────
// Full Commit Diff
// ─────────────────────────────────────────────────────────────────

describe('computeCommitDiff', () => {
  it('computes summary counts correctly', () => {
    const commitA = {
      ingredients: [makeIngredient(1, 100), makeIngredient(2, 50)],
      steps: [makeStep(1, 'Mix'), makeStep(2, 'Bake')],
    }
    const commitB = {
      ingredients: [makeIngredient(1, 200), makeIngredient(3, 75)],
      steps: [makeStep(1, 'Mix well'), makeStep(3, 'Serve')],
    }
    const diff = computeCommitDiff(commitA, commitB)
    expect(diff.summary.ingredientsModified).toBe(1) // ingredient 1 changed quantity
    expect(diff.summary.ingredientsRemoved).toBe(1) // ingredient 2 removed
    expect(diff.summary.ingredientsAdded).toBe(1) // ingredient 3 added
    expect(diff.summary.stepsModified).toBe(1) // step 1 modified
    expect(diff.summary.stepsAdded).toBe(1) // step 3 added
  })

  it('returns zero summary for identical commits', () => {
    const snapshot = {
      ingredients: [makeIngredient(1, 100)],
      steps: [makeStep(1, 'Do something')],
    }
    const diff = computeCommitDiff(snapshot, snapshot)
    expect(diff.summary.ingredientsAdded).toBe(0)
    expect(diff.summary.ingredientsRemoved).toBe(0)
    expect(diff.summary.ingredientsModified).toBe(0)
    expect(diff.summary.stepsAdded).toBe(0)
    expect(diff.summary.stepsModified).toBe(0)
  })
})
