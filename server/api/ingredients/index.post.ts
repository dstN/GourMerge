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

const createIngredientSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  /** Optional initial translations, e.g. { de: "Mehl", en: "Flour" } */
  nameTranslations: z.record(z.string(), z.string()).optional(),
  category: z.string().max(100).optional(),
  /** Brand for a branded product, e.g. "Barilla". */
  manufacturer: z.string().max(200).trim().optional(),
  /** Optional per-100 g values, stored with `source: 'user'`. */
  nutrition: ingredientNutritionSchema.optional(),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  // Every write here lands in the GLOBAL catalog every other user's autocomplete then
  // reads — unlike a recipe or a comment, this is not the caller's own content to spam.
  // Generous enough for genuine recipe authoring (a handful of new ingredients per
  // recipe), tight enough that a script cannot flood the catalog.
  await useRateLimit(`ingredient:create:${session.user.id}`, { max: 20, windowSeconds: 600 })

  const body = await readBody(event)
  const result = createIngredientSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Validation failed',
      data: result.error.flatten().fieldErrors,
    })
  }

  const { name, nameTranslations, category, manufacturer, nutrition } = result.data
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

  // Create new ingredient. `createdBy` is what makes it editable/reportable later
  // (see the `ingredients.created_by` comment in schema.ts) — the Swiss BLV import
  // never sets it, so this is the one clean "did a user make this row" signal.
  const [created] = await db
    .insert(ingredients)
    .values({
      name: name.trim(),
      nameTranslations: nameTranslations ?? {},
      category: category ?? null,
      manufacturer: manufacturer ?? null,
      createdBy: session.user.id,
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
      micros: microsToStore(nutrition!.micros),
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
