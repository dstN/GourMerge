/**
 * GourMerge — Three-Way Snapshot Merge Engine
 *
 * Implements a three-way merge for recipe snapshots (ingredients + steps).
 *
 * Algorithm:
 *   base   = common ancestor snapshot (the fork point or last shared commit)
 *   source = proposed changes ("theirs", GourMerge Request source branch head)
 *   target = current state ("ours", the branch being merged into)
 *
 * Ingredients are keyed by `ingredientId` (stable identity).
 * Steps are keyed by `sortOrder` (positional identity for v1).
 *
 * For each entity, we compare base→source and base→target independently:
 *   - Only one side changed → auto-apply that side's change
 *   - Neither side changed  → keep base (= both are the same)
 *   - Both changed the same way → no conflict, apply the change
 *   - Both changed differently  → CONFLICT
 *
 * LIMITATIONS (acceptable for v1):
 * - Steps are matched by sortOrder; complex reorder-and-modify is not handled
 * - No structural text merge within a step (whole step = one unit)
 */

import type { CanonicalUnit } from '~~/shared/types/index'

// ── Public types ─────────────────────────────────────────────────

export interface MergeIngredient {
  ingredientId: number
  ingredientName?: string
  quantity: string
  unit: CanonicalUnit
  notes?: string | null
  sortOrder: number
}

export interface MergeStep {
  sortOrder: number
  content: string
}

export interface MergeSnapshot {
  ingredients: MergeIngredient[]
  steps: MergeStep[]
}

export interface MergeConflict {
  type: 'ingredient' | 'step'
  ingredientId?: number
  ingredientName?: string
  stepSortOrder?: number
  description: string
  sourceVersion: MergeIngredient | MergeStep | null
  targetVersion: MergeIngredient | MergeStep | null
}

export interface MergeResult {
  hasConflicts: boolean
  ingredients: MergeIngredient[]
  steps: MergeStep[]
  conflicts: MergeConflict[]
}

// ── Comparison helpers ───────────────────────────────────────────

function ingContentKey(i: MergeIngredient): string {
  return `${i.quantity}:${i.unit}:${i.notes ?? ''}`
}

function ingFullKey(i: MergeIngredient): string {
  return `${i.quantity}:${i.unit}:${i.notes ?? ''}:${i.sortOrder}`
}

// ── Merge implementation ─────────────────────────────────────────

export function threeWayMerge(
  base: MergeSnapshot,
  source: MergeSnapshot,
  target: MergeSnapshot,
): MergeResult {
  const conflicts: MergeConflict[] = []
  const mergedIngredients: MergeIngredient[] = []
  const mergedSteps: MergeStep[] = []

  // ── Ingredient merge ──────────────────────────────────────────
  const baseIngMap = new Map(base.ingredients.map((i) => [i.ingredientId, i]))
  const sourceIngMap = new Map(source.ingredients.map((i) => [i.ingredientId, i]))
  const targetIngMap = new Map(target.ingredients.map((i) => [i.ingredientId, i]))

  // Collect all ingredient IDs from all three snapshots
  const allIngIds = new Set([
    ...baseIngMap.keys(),
    ...sourceIngMap.keys(),
    ...targetIngMap.keys(),
  ])

  for (const id of allIngIds) {
    const b = baseIngMap.get(id) ?? null
    const s = sourceIngMap.get(id) ?? null
    const t = targetIngMap.get(id) ?? null

    const sourceChanged = b === null ? s !== null : (s === null || ingFullKey(b) !== ingFullKey(s))
    const targetChanged = b === null ? t !== null : (t === null || ingFullKey(b) !== ingFullKey(t))

    if (!sourceChanged && !targetChanged) {
      // Neither changed — keep base (= target = source)
      if (b !== null) mergedIngredients.push(b)
    } else if (sourceChanged && !targetChanged) {
      // Only source changed: use source (null = deleted)
      if (s !== null) mergedIngredients.push(s)
    } else if (!sourceChanged && targetChanged) {
      // Only target changed: use target (null = deleted)
      if (t !== null) mergedIngredients.push(t)
    } else {
      // Both changed
      if (s === null && t === null) {
        // Both deleted — no conflict, just gone
      } else if (s !== null && t !== null && ingContentKey(s) === ingContentKey(t)) {
        // Both made the same change — no conflict
        mergedIngredients.push(s)
      } else {
        // Real conflict
        conflicts.push({
          type: 'ingredient',
          ingredientId: id,
          ingredientName: s?.ingredientName ?? t?.ingredientName ?? b?.ingredientName ?? String(id),
          description: s === null
            ? `Source deleted this ingredient, but target modified it`
            : t === null
              ? `Target deleted this ingredient, but source modified it`
              : `Both source and target modified this ingredient differently`,
          sourceVersion: s,
          targetVersion: t,
        })
        // Still include a version in the result (source takes precedence) for display
        if (s !== null) mergedIngredients.push(s)
        else if (t !== null) mergedIngredients.push(t)
      }
    }
  }

  // Sort merged ingredients by sortOrder
  mergedIngredients.sort((a, b) => a.sortOrder - b.sortOrder)

  // ── Step merge ────────────────────────────────────────────────
  const baseStepMap = new Map(base.steps.map((s) => [s.sortOrder, s]))
  const sourceStepMap = new Map(source.steps.map((s) => [s.sortOrder, s]))
  const targetStepMap = new Map(target.steps.map((s) => [s.sortOrder, s]))

  const allStepOrders = new Set([
    ...baseStepMap.keys(),
    ...sourceStepMap.keys(),
    ...targetStepMap.keys(),
  ])

  for (const order of allStepOrders) {
    const b = baseStepMap.get(order) ?? null
    const s = sourceStepMap.get(order) ?? null
    const t = targetStepMap.get(order) ?? null

    const sourceChanged = b === null ? s !== null : (s === null || b.content !== s.content)
    const targetChanged = b === null ? t !== null : (t === null || b.content !== t.content)

    if (!sourceChanged && !targetChanged) {
      if (b !== null) mergedSteps.push(b)
    } else if (sourceChanged && !targetChanged) {
      if (s !== null) mergedSteps.push(s)
    } else if (!sourceChanged && targetChanged) {
      if (t !== null) mergedSteps.push(t)
    } else {
      // Both changed
      if (s === null && t === null) {
        // Both removed — clean
      } else if (s !== null && t !== null && s.content === t.content) {
        // Same change — clean
        mergedSteps.push(s)
      } else {
        conflicts.push({
          type: 'step',
          stepSortOrder: order,
          description: s === null
            ? `Source deleted step ${order}, but target modified it`
            : t === null
              ? `Target deleted step ${order}, but source modified it`
              : `Both source and target modified step ${order} differently`,
          sourceVersion: s,
          targetVersion: t,
        })
        // Include source version in result for display
        if (s !== null) mergedSteps.push(s)
        else if (t !== null) mergedSteps.push(t)
      }
    }
  }

  // Sort merged steps by sortOrder
  mergedSteps.sort((a, b) => a.sortOrder - b.sortOrder)

  return {
    hasConflicts: conflicts.length > 0,
    ingredients: mergedIngredients,
    steps: mergedSteps,
    conflicts,
  }
}
