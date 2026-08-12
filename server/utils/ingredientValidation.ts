/**
 * Shared between creating and editing a user-contributed ingredient — both write the same
 * nutrition fields `server/utils/nutrition.ts` reads, and both need the same DECIMAL-safe
 * parsing (a JS float would quietly round a value on the way in).
 */
import { z } from 'zod'
import { MICRO_KEYS } from '~~/shared/utils/ingredientMicros'

export const decimalSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).replace(',', '.'))
  .refine((v) => v === '' || (!Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100000), {
    message: 'must be a non-negative number',
  })
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional()

/**
 * `grams_per_piece` is an `int` column, not `decimal` — stored (and read back by Drizzle) as
 * a JS number, not a string, unlike every other field here. Same empty-string-clears-it shape
 * as `decimalSchema`, but whole numbers only: a fractional gram count is never real.
 */
export const gramsPerPieceSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) > 0 && Number(v) <= 100000), {
    message: 'must be a positive whole number',
  })
  .transform((v) => (v === '' ? null : Number(v)))
  .nullable()
  .optional()

/** Same six-decimal-fields shape, keyed by the vitamin/mineral catalog in `MICRO_KEYS`. */
export const ingredientMicrosSchema = z.object(Object.fromEntries(MICRO_KEYS.map((key) => [key, decimalSchema])))

export const ingredientNutritionSchema = z.object({
  energyKcal100g: decimalSchema,
  protein100g: decimalSchema,
  carbs100g: decimalSchema,
  sugars100g: decimalSchema,
  fat100g: decimalSchema,
  saturatedFat100g: decimalSchema,
  fiber100g: decimalSchema,
  salt100g: decimalSchema,
  /** Approximate grams per one `piece` — see the `toGrams()` doc in `nutrition.ts`. */
  gramsPerPiece: gramsPerPieceSchema,
  micros: ingredientMicrosSchema.optional(),
})

/**
 * `micros` is a plain JSON blob, not DECIMAL columns, and `computeNutrition` already does
 * float arithmetic on it (`val * factor`) — so unlike the macro fields there is no
 * DB-precision reason to keep these as strings. Stored as numbers to match the shape the
 * Swiss BLV import already writes (`scripts/import-swiss-foods.mjs`), so a recipe's micro
 * totals never mix string and number entries depending on which import created them.
 */
export function microsToStore(micros: Record<string, string | null | undefined> | undefined): Record<string, number> {
  if (!micros) return {}
  return Object.fromEntries(
    Object.entries(micros)
      .filter(([, v]) => v != null)
      .map(([k, v]) => [k, Number(v)])
  )
}
