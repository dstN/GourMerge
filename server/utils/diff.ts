// Compares two recipe commit snapshots: ingredients diffed by id, step Markdown diffed via
// diff-match-patch-es.

import { diffMain, diffCleanupSemantic } from 'diff-match-patch-es'
import type {
  CommitIngredient,
  CommitStep,
  CommitDiff,
  IngredientDiffEntry,
  StepDiffEntry,
  TextDiffSegment,
  DiffChangeType,
  CanonicalUnit,
} from '~~/shared/types'

// ═══════════════════════════════════════════════════════════════
// INGREDIENT DIFF
// ═══════════════════════════════════════════════════════════════

interface IngredientSnapshot {
  ingredientId: number
  ingredientName: string
  quantity: number
  unit: CanonicalUnit
}

/**
 * Normalize CommitIngredient[] to a simpler snapshot format for diffing.
 */
function normalizeIngredients(ingredients: CommitIngredient[]): IngredientSnapshot[] {
  return ingredients.map((ing) => ({
    ingredientId: ing.ingredientId,
    ingredientName: ing.ingredient?.name ?? `Ingredient #${ing.ingredientId}`,
    quantity: typeof ing.quantity === 'string' ? parseFloat(ing.quantity) : ing.quantity,
    unit: ing.unit,
  }))
}

/**
 * Compute a structured diff between two ingredient snapshots.
 *
 * Strategy: Index both lists by `ingredientId`, then classify each ingredient as:
 * - `added`: present in new, absent in old
 * - `removed`: present in old, absent in new
 * - `modified`: present in both, but quantity or unit changed
 * - `unchanged`: present in both, identical
 */
export function computeIngredientDiff(
  oldIngredients: CommitIngredient[],
  newIngredients: CommitIngredient[]
): IngredientDiffEntry[] {
  const oldMap = new Map<number, IngredientSnapshot>()
  const newMap = new Map<number, IngredientSnapshot>()

  for (const ing of normalizeIngredients(oldIngredients)) {
    oldMap.set(ing.ingredientId, ing)
  }
  for (const ing of normalizeIngredients(newIngredients)) {
    newMap.set(ing.ingredientId, ing)
  }

  const result: IngredientDiffEntry[] = []
  const processedIds = new Set<number>()

  // Process old ingredients (check for removed / modified / unchanged)
  for (const [id, oldIng] of oldMap) {
    processedIds.add(id)
    const newIng = newMap.get(id)

    if (!newIng) {
      // Removed
      result.push({
        type: 'removed',
        ingredientId: id,
        ingredientName: oldIng.ingredientName,
        oldQuantity: oldIng.quantity,
        oldUnit: oldIng.unit,
      })
    } else {
      // Check for modifications
      const changes: ('quantity' | 'unit')[] = []
      if (oldIng.quantity !== newIng.quantity) changes.push('quantity')
      if (oldIng.unit !== newIng.unit) changes.push('unit')

      if (changes.length > 0) {
        result.push({
          type: 'modified',
          ingredientId: id,
          ingredientName: newIng.ingredientName,
          oldQuantity: oldIng.quantity,
          oldUnit: oldIng.unit,
          newQuantity: newIng.quantity,
          newUnit: newIng.unit,
          changes,
        })
      } else {
        result.push({
          type: 'unchanged',
          ingredientId: id,
          ingredientName: oldIng.ingredientName,
          oldQuantity: oldIng.quantity,
          oldUnit: oldIng.unit,
          newQuantity: newIng.quantity,
          newUnit: newIng.unit,
        })
      }
    }
  }

  // Process new ingredients not in old (added)
  for (const [id, newIng] of newMap) {
    if (!processedIds.has(id)) {
      result.push({
        type: 'added',
        ingredientId: id,
        ingredientName: newIng.ingredientName,
        newQuantity: newIng.quantity,
        newUnit: newIng.unit,
      })
    }
  }

  // Sort: removed first, then modified, then unchanged, then added
  const typeOrder: Record<DiffChangeType, number> = {
    removed: 0,
    modified: 1,
    unchanged: 2,
    added: 3,
  }
  result.sort((a, b) => typeOrder[a.type] - typeOrder[b.type])

  return result
}

// ═══════════════════════════════════════════════════════════════
// TEXT DIFF (for Markdown steps)
// ═══════════════════════════════════════════════════════════════

/**
 * Compute a fine-grained text diff between two Markdown strings.
 * Uses Google's diff-match-patch algorithm for optimal results.
 *
 * Returns an array of segments, each with a type:
 * -  0 = equal (unchanged text)
 * -  1 = insertion (new text)
 * - -1 = deletion (removed text)
 */
export function computeTextDiff(oldText: string, newText: string): TextDiffSegment[] {
  const rawDiffs = diffMain(oldText, newText)

  // Clean up for human-readable output (merge adjacent equal segments, etc.)
  diffCleanupSemantic(rawDiffs)

  return rawDiffs.map(([type, text]) => ({
    type: type as -1 | 0 | 1,
    text,
  }))
}

/**
 * Compute a structured diff between two ordered lists of recipe steps.
 *
 * Strategy:
 * - Match steps by `sortOrder` position (steps are conceptually "files" with a fixed order)
 * - If both old and new have a step at position N → compare content (text diff)
 * - If old has a step at position N but new doesn't → step removed
 * - If new has a step at position N but old doesn't → step added
 */
export function computeStepsDiff(oldSteps: CommitStep[], newSteps: CommitStep[]): StepDiffEntry[] {
  // Sort by sortOrder for alignment
  const oldSorted = [...oldSteps].sort((a, b) => a.sortOrder - b.sortOrder)
  const newSorted = [...newSteps].sort((a, b) => a.sortOrder - b.sortOrder)

  const oldMap = new Map<number, CommitStep>()
  const newMap = new Map<number, CommitStep>()

  for (const step of oldSorted) oldMap.set(step.sortOrder, step)
  for (const step of newSorted) newMap.set(step.sortOrder, step)

  const allPositions = new Set([...oldMap.keys(), ...newMap.keys()])
  const sortedPositions = [...allPositions].sort((a, b) => a - b)

  const result: StepDiffEntry[] = []

  for (const pos of sortedPositions) {
    const oldStep = oldMap.get(pos)
    const newStep = newMap.get(pos)

    if (oldStep && !newStep) {
      // Step removed
      result.push({
        type: 'removed',
        sortOrder: pos,
        oldContent: oldStep.content,
      })
    } else if (!oldStep && newStep) {
      // Step added
      result.push({
        type: 'added',
        sortOrder: pos,
        newContent: newStep.content,
      })
    } else if (oldStep && newStep) {
      if (oldStep.content === newStep.content) {
        // Unchanged
        result.push({
          type: 'unchanged',
          sortOrder: pos,
          oldContent: oldStep.content,
          newContent: newStep.content,
        })
      } else {
        // Modified — compute text diff
        const segments = computeTextDiff(oldStep.content, newStep.content)
        result.push({
          type: 'modified',
          sortOrder: pos,
          oldContent: oldStep.content,
          newContent: newStep.content,
          segments,
        })
      }
    }
  }

  return result
}

// ═══════════════════════════════════════════════════════════════
// FULL COMMIT DIFF
// ═══════════════════════════════════════════════════════════════

/**
 * Compute a complete diff between two recipe commits.
 *
 * This is the main entry point — called by the API route
 * `GET /api/recipes/:id/diff?from=<commitA>&to=<commitB>`
 *
 * @param commitA - The "base" commit (older)
 * @param commitB - The "head" commit (newer)
 * @returns A CommitDiff object with ingredient diffs, step diffs, and a summary
 */
export function computeCommitDiff(
  commitA: { ingredients: CommitIngredient[]; steps: CommitStep[] },
  commitB: { ingredients: CommitIngredient[]; steps: CommitStep[] }
): CommitDiff {
  const ingredientDiffs = computeIngredientDiff(commitA.ingredients, commitB.ingredients)
  const stepDiffs = computeStepsDiff(commitA.steps, commitB.steps)

  // Compute summary counts
  const summary = {
    ingredientsAdded: ingredientDiffs.filter((d) => d.type === 'added').length,
    ingredientsRemoved: ingredientDiffs.filter((d) => d.type === 'removed').length,
    ingredientsModified: ingredientDiffs.filter((d) => d.type === 'modified').length,
    stepsAdded: stepDiffs.filter((d) => d.type === 'added').length,
    stepsRemoved: stepDiffs.filter((d) => d.type === 'removed').length,
    stepsModified: stepDiffs.filter((d) => d.type === 'modified').length,
  }

  return {
    ingredients: ingredientDiffs,
    steps: stepDiffs,
    summary,
  }
}
