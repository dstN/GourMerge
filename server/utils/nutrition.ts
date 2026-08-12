/**
 * Aggregates macronutrients for a set of commit ingredients: converts each quantity to
 * grams, then multiplies by the per-100g values from ingredient_nutrition.
 *
 * Returns approximate results when:
 *   - An ingredient has no nutrition data
 *   - A volume ingredient has no density (falls back to water density = 1.0)
 *   - A `piece` ingredient has no gramsPerPiece value
 */

import type { NutritionTotals } from '~~/shared/types/recipe'

// ── tsp/tbsp in ml (canonical conversion constants) ──────────────────────────
const TSP_ML = 4.92892
const TBSP_ML = 14.7868
const PINCH_G = 0.3

type CommitUnit = 'g' | 'ml' | 'piece' | 'pinch' | 'tsp' | 'tbsp'

export interface IngredientNutritionRow {
  ingredientId: number
  energyKcal100g: string | null
  protein100g: string | null
  carbs100g: string | null
  sugars100g?: string | null
  fat100g: string | null
  saturatedFat100g: string | null
  fiber100g: string | null
  salt100g?: string | null
  densityGPerMl: string | null
  gramsPerPiece: number | null
  micros?: unknown
}

export interface CommitIngredientInput {
  ingredientId: number
  quantity: string // DECIMAL stored as string by mysql2
  unit: CommitUnit
  ingredientName?: string
}

/**
 * Convert a commit ingredient quantity to grams.
 * Returns null when conversion is impossible (unknown unit).
 */
function toGrams(
  quantity: number,
  unit: CommitUnit,
  density: number | null,
  gramsPerPiece: number | null
): { grams: number; approximate: boolean } | null {
  switch (unit) {
    case 'g':
      return { grams: quantity, approximate: false }

    case 'ml': {
      const d = density ?? 1.0 // fallback: assume water density
      return { grams: quantity * d, approximate: density === null }
    }

    case 'tsp': {
      const d = density ?? 1.0
      return { grams: quantity * TSP_ML * d, approximate: density === null }
    }

    case 'tbsp': {
      const d = density ?? 1.0
      return { grams: quantity * TBSP_ML * d, approximate: density === null }
    }

    case 'piece': {
      if (gramsPerPiece) {
        return { grams: quantity * gramsPerPiece, approximate: false }
      }
      return { grams: quantity * 100, approximate: true }
    }

    case 'pinch':
      return { grams: quantity * PINCH_G, approximate: true }

    default:
      return null
  }
}

/**
 * Compute nutrition totals for a list of commit ingredients.
 *
 * @param commitIngredients  - Raw ingredient rows from recipe_commit_ingredients
 * @param nutritionByIngredientId - Map from ingredientId → nutrition row (left-joined)
 */
export function computeNutritionTotals(
  commitIngredients: CommitIngredientInput[],
  nutritionByIngredientId: Map<number, IngredientNutritionRow>
): NutritionTotals {
  let kcal = 0
  let protein = 0
  let carbs = 0
  let sugars = 0
  let fat = 0
  let saturatedFat = 0
  let fiber = 0
  let salt = 0
  let isApproximate = false
  let missingCount = 0
  let coveredCount = 0
  const microsTotal: Record<string, number> = {}
  const missingIngredientNames: string[] = []

  for (const ci of commitIngredients) {
    const n = nutritionByIngredientId.get(ci.ingredientId)
    if (!n || n.energyKcal100g === null) {
      missingCount++
      isApproximate = true
      if (ci.ingredientName) missingIngredientNames.push(ci.ingredientName)
      continue
    }

    const density = n.densityGPerMl ? parseFloat(n.densityGPerMl) : null
    const gPiece = n.gramsPerPiece ?? null
    const qty = parseFloat(ci.quantity)

    const conv = toGrams(qty, ci.unit, density, gPiece)
    if (!conv) {
      missingCount++
      isApproximate = true
      continue
    }

    if (conv.approximate) isApproximate = true
    const factor = conv.grams / 100

    kcal += parseFloat(n.energyKcal100g ?? '0') * factor
    protein += parseFloat(n.protein100g ?? '0') * factor
    carbs += parseFloat(n.carbs100g ?? '0') * factor
    sugars += parseFloat(n.sugars100g ?? '0') * factor
    fat += parseFloat(n.fat100g ?? '0') * factor
    saturatedFat += parseFloat(n.saturatedFat100g ?? '0') * factor
    fiber += parseFloat(n.fiber100g ?? '0') * factor
    salt += parseFloat(n.salt100g ?? '0') * factor
    coveredCount++

    const micros = n.micros as Record<string, number | null> | null
    if (micros) {
      for (const [key, val] of Object.entries(micros)) {
        if (typeof val === 'number' && isFinite(val)) {
          microsTotal[key] = (microsTotal[key] ?? 0) + val * factor
        }
      }
    }
  }

  const round2 = (v: number) => Math.round(v * 100) / 100
  const micros = Object.fromEntries(
    Object.entries(microsTotal)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => [k, round2(v)])
  )

  return {
    kcal: round2(kcal),
    protein: round2(protein),
    carbs: round2(carbs),
    sugars: round2(sugars),
    fat: round2(fat),
    saturatedFat: round2(saturatedFat),
    fiber: round2(fiber),
    salt: round2(salt),
    isApproximate,
    missingCount,
    coveredCount,
    micros: Object.keys(micros).length > 0 ? micros : undefined,
    missingIngredients: missingIngredientNames.length > 0 ? missingIngredientNames : undefined,
  }
}

/**
 * Divide nutrition totals by the number of servings to get per-serving values.
 */
export function perServing(totals: NutritionTotals, servings: number): NutritionTotals {
  if (servings <= 0) return totals
  const d = (v: number) => Math.round((v / servings) * 100) / 100
  return {
    kcal: d(totals.kcal),
    protein: d(totals.protein),
    carbs: d(totals.carbs),
    sugars: d(totals.sugars),
    fat: d(totals.fat),
    saturatedFat: d(totals.saturatedFat),
    fiber: d(totals.fiber),
    salt: d(totals.salt),
    isApproximate: totals.isApproximate,
    missingCount: totals.missingCount,
    coveredCount: totals.coveredCount,
    micros: totals.micros ? Object.fromEntries(Object.entries(totals.micros).map(([k, v]) => [k, d(v)])) : undefined,
  }
}
