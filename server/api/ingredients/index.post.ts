/**
 * POST /api/ingredients — Create or get a master ingredient by name
 *
 * Deduplicates by normalized canonical name (lowercase, trimmed).
 * If an ingredient with the same normalized name already exists, returns it.
 * Otherwise creates a new one.
 *
 * Used during the commit flow when the user types a new ingredient name
 * that doesn't exist in the master table yet.
 */
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { ingredients, ingredientNutrition } from '~~/server/database/schema'

/**
 * Exactly the six fields `server/utils/nutrition.ts` consumes — no more. Offering the
 * other twenty columns would be asking users to hand-type data nothing reads.
 *
 * Accepted as strings because the column type is DECIMAL: going through a JS float would
 * quietly round values on the way in.
 */
const decimal = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).replace(',', '.'))
  .refine((v) => v === '' || (!Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100000), {
    message: 'must be a non-negative number',
  })
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional()

const nutritionSchema = z.object({
  energyKcal100g: decimal,
  protein100g: decimal,
  carbs100g: decimal,
  fat100g: decimal,
  fiber100g: decimal,
  saturatedFat100g: decimal,
})

const createIngredientSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  /** Optional initial translations, e.g. { de: "Mehl", en: "Flour" } */
  nameTranslations: z.record(z.string(), z.string()).optional(),
  category: z.string().max(100).optional(),
  /** Optional per-100 g values, stored with `source: 'user'`. */
  nutrition: nutritionSchema.optional(),
})

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const body = await readBody(event)
  const result = createIngredientSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Validation failed',
      data: result.error.flatten().fieldErrors,
    })
  }

  const { name, nameTranslations, category, nutrition } = result.data
  const normalizedName = name.toLowerCase().trim()
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // Try to find existing by exact normalized name (case-insensitive via LOWER())
  const [existing] = await db
    .select({
      id: ingredients.id,
      name: ingredients.name,
      nameTranslations: ingredients.nameTranslations,
      category: ingredients.category,
    })
    .from(ingredients)
    .where(sql`LOWER(${ingredients.name}) = ${normalizedName}`)
    .limit(1)

  if (existing) {
    return { ...existing, created: false }
  }

  // Create new ingredient
  const [created] = await db
    .insert(ingredients)
    .values({
      name: name.trim(),
      nameTranslations: nameTranslations ?? {},
      category: category ?? null,
    })
    .$returningId()

  if (!created) throw createError({ statusCode: 500, statusMessage: 'Insert failed.' })

  /**
   * Only written when there is an energy value. `computeNutrition` treats
   * `energyKcal100g === null` as "this ingredient is not covered" and reports it in
   * `missingCount`, so a row of all-nulls would be worse than no row: it would claim
   * coverage the data does not have and silently drag every total toward zero.
   */
  const hasNutrition = !!nutrition && nutrition.energyKcal100g != null && nutrition.energyKcal100g !== ''
  if (hasNutrition) {
    await db.insert(ingredientNutrition).values({
      ingredientId: created.id,
      energyKcal100g: nutrition!.energyKcal100g ?? null,
      protein100g: nutrition!.protein100g ?? null,
      carbs100g: nutrition!.carbs100g ?? null,
      fat100g: nutrition!.fat100g ?? null,
      fiber100g: nutrition!.fiber100g ?? null,
      saturatedFat100g: nutrition!.saturatedFat100g ?? null,
      // Distinguishable from the Swiss BLV import, so a future re-import knows not to
      // overwrite it and the UI can label it as self-reported.
      source: 'user',
    })
    logger.info('user-supplied nutrition stored', { ingredientId: created.id })
  }

  setResponseStatus(event, 201)
  return {
    id: created.id,
    name: name.trim(),
    nameTranslations: nameTranslations ?? {},
    category: category ?? null,
    hasNutrition,
    created: true,
  }
})
