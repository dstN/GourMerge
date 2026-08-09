/**
 * Shared between creating and editing a user-contributed ingredient — both write exactly
 * the six nutrition fields `server/utils/nutrition.ts` reads, no more, and both need the
 * same DECIMAL-safe parsing (a JS float would quietly round a value on the way in).
 */
import { z } from 'zod'

export const decimalSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).replace(',', '.'))
  .refine((v) => v === '' || (!Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100000), {
    message: 'must be a non-negative number',
  })
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional()

export const ingredientNutritionSchema = z.object({
  energyKcal100g: decimalSchema,
  protein100g: decimalSchema,
  carbs100g: decimalSchema,
  fat100g: decimalSchema,
  fiber100g: decimalSchema,
  saturatedFat100g: decimalSchema,
})
