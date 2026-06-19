/**
 * GourMerge — Unit Conversion Utilities (Nitro Server Utility)
 *
 * Handles conversion between the canonical metric units stored in the DB
 * and the display units shown to users.
 *
 * DATABASE RULE: Only g (grams) and ml (milliliters) are stored for mass/volume.
 * Display conversion to imperial or other units happens here.
 */

import type { CanonicalUnit, DisplayUnit, MeasurementSystem } from '~~/shared/types'

// ═══════════════════════════════════════════════════════════════
// CONVERSION CONSTANTS
// ═══════════════════════════════════════════════════════════════

/** Conversion factors TO metric base units (g or ml) */
const TO_METRIC: Record<string, { factor: number; targetUnit: CanonicalUnit }> = {
  // Mass → grams
  kg: { factor: 1000, targetUnit: 'g' },
  oz: { factor: 28.3495, targetUnit: 'g' },
  lb: { factor: 453.592, targetUnit: 'g' },

  // Volume → milliliters
  l: { factor: 1000, targetUnit: 'ml' },
  cup: { factor: 236.588, targetUnit: 'ml' },
  floz: { factor: 29.5735, targetUnit: 'ml' },

  // Small measures (these are canonical, no conversion needed)
  tsp: { factor: 4.92892, targetUnit: 'ml' },
  tbsp: { factor: 14.7868, targetUnit: 'ml' },
}

/** Conversion factors FROM metric base units (for display) */
const FROM_METRIC: Record<string, { factor: number; sourceUnit: CanonicalUnit }> = {
  // From grams
  kg: { factor: 0.001, sourceUnit: 'g' },
  oz: { factor: 0.035274, sourceUnit: 'g' },
  lb: { factor: 0.00220462, sourceUnit: 'g' },

  // From milliliters
  l: { factor: 0.001, sourceUnit: 'ml' },
  cup: { factor: 0.00422675, sourceUnit: 'ml' },
  floz: { factor: 0.033814, sourceUnit: 'ml' },

  // From ml to small measures
  tsp: { factor: 0.202884, sourceUnit: 'ml' },
  tbsp: { factor: 0.067628, sourceUnit: 'ml' },
}

// ═══════════════════════════════════════════════════════════════
// CONVERSION FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Convert a quantity from any supported unit to its canonical metric form.
 * Used when storing user input into the database.
 *
 * @example
 * toMetric(2, 'cup')   → { quantity: 473.18, unit: 'ml' }
 * toMetric(8, 'oz')    → { quantity: 226.80, unit: 'g' }
 * toMetric(500, 'g')   → { quantity: 500, unit: 'g' }    // already canonical
 * toMetric(3, 'piece') → { quantity: 3, unit: 'piece' }  // passthrough
 */
export function toMetric(quantity: number, unit: DisplayUnit): { quantity: number; unit: CanonicalUnit } {
  // Already canonical?
  if (unit === 'g' || unit === 'ml' || unit === 'piece' || unit === 'pinch') {
    return { quantity, unit }
  }

  // Special case: tsp/tbsp are canonical units but CAN be converted to ml
  if (unit === 'tsp' || unit === 'tbsp') {
    return { quantity, unit }
  }

  const conversion = TO_METRIC[unit]
  if (!conversion) {
    throw new Error(`Unknown unit: ${unit}`)
  }

  return {
    quantity: Math.round(quantity * conversion.factor * 100) / 100,
    unit: conversion.targetUnit,
  }
}

/**
 * Convert a canonical metric quantity to a display unit.
 * Used when rendering recipes for the user.
 *
 * @example
 * fromMetric(473.18, 'ml', 'cup') → { quantity: 2.00, unit: 'cup' }
 * fromMetric(226.80, 'g', 'oz')   → { quantity: 8.00, unit: 'oz' }
 */
export function fromMetric(
  quantity: number,
  canonicalUnit: CanonicalUnit,
  targetUnit: DisplayUnit
): { quantity: number; unit: DisplayUnit } {
  // Same unit? No conversion.
  if (canonicalUnit === targetUnit) {
    return { quantity, unit: targetUnit }
  }

  const conversion = FROM_METRIC[targetUnit]
  if (!conversion || conversion.sourceUnit !== canonicalUnit) {
    // Can't convert (e.g., g → cup doesn't make sense without density)
    return { quantity, unit: canonicalUnit }
  }

  return {
    quantity: Math.round(quantity * conversion.factor * 100) / 100,
    unit: targetUnit,
  }
}

/**
 * Get the best display unit for a given canonical unit and measurement system.
 * Applies smart thresholds (e.g., show kg instead of g for large amounts).
 */
export function getBestDisplayUnit(
  quantity: number,
  canonicalUnit: CanonicalUnit,
  system: MeasurementSystem
): { quantity: number; unit: DisplayUnit } {
  if (canonicalUnit === 'piece' || canonicalUnit === 'pinch') {
    return { quantity, unit: canonicalUnit }
  }

  if (canonicalUnit === 'tsp' || canonicalUnit === 'tbsp') {
    return { quantity, unit: canonicalUnit }
  }

  if (system === 'metric') {
    // Smart metric display
    if (canonicalUnit === 'g' && quantity >= 1000) {
      return { quantity: Math.round(quantity / 10) / 100, unit: 'kg' }
    }
    if (canonicalUnit === 'ml' && quantity >= 1000) {
      return { quantity: Math.round(quantity / 10) / 100, unit: 'l' }
    }
    return { quantity, unit: canonicalUnit }
  }

  // Imperial display
  if (canonicalUnit === 'g') {
    if (quantity >= 453.592) {
      return fromMetric(quantity, 'g', 'lb')
    }
    return fromMetric(quantity, 'g', 'oz')
  }

  if (canonicalUnit === 'ml') {
    if (quantity >= 236.588) {
      return fromMetric(quantity, 'ml', 'cup')
    }
    return fromMetric(quantity, 'ml', 'floz')
  }

  return { quantity, unit: canonicalUnit }
}

/**
 * Format a quantity + unit for display with locale-aware number formatting.
 *
 * @example
 * formatQuantityUnit(250, 'g', 'en')  → "250 g"
 * formatQuantityUnit(1.5, 'kg', 'de') → "1,5 kg"
 */
export function formatQuantityUnit(quantity: number, unit: DisplayUnit, locale: string = 'en'): string {
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(quantity)

  return `${formatted} ${unit}`
}
