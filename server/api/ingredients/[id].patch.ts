/**
 * PATCH /api/ingredients/:id — Edit an ingredient the caller created.
 *
 * Only `ingredients.created_by === session.user.id` may edit — never the Swiss BLV rows
 * (`created_by IS NULL`) and never another user's contribution, regardless of role. There
 * is no admin override here on purpose: an admin acting on a bad user-submitted ingredient
 * goes through the report queue and deletes it (or asks the author to fix it), the same
 * "the moderation tools are the response" shape as every other reportable kind — editing
 * someone else's data in place would leave no trace of who actually wrote what.
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { ingredients, ingredientNutrition } from '~~/server/database/schema'

const patchSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  nameTranslations: z.record(z.string(), z.string()).optional(),
  category: z.string().max(100).optional().nullable(),
  manufacturer: z.string().max(200).trim().optional().nullable(),
  nutrition: ingredientNutritionSchema.optional(),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: 'Invalid ingredient id' })

  const result = patchSchema.safeParse(await readBody(event))
  if (!result.success) {
    throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: result.error.flatten().fieldErrors })
  }

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [existing] = await db
    .select({ createdBy: ingredients.createdBy })
    .from(ingredients)
    .where(eq(ingredients.id, id))
    .limit(1)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Ingredient not found' })
  if (existing.createdBy !== session.user.id) {
    // 404, not 403: same reasoning as `requireVisibleRecipe` — an ingredient's edit
    // history is not something to confirm the existence of to someone who cannot touch it.
    throw createError({ statusCode: 404, statusMessage: 'Ingredient not found' })
  }

  await useRateLimit(`ingredient:update:${session.user.id}`, { max: 20, windowSeconds: 600 })

  const { name, nameTranslations, category, manufacturer, nutrition } = result.data
  const updates: Partial<typeof ingredients.$inferInsert> = {}
  if (name !== undefined) updates.name = name
  if (nameTranslations !== undefined) updates.nameTranslations = nameTranslations
  if (category !== undefined) updates.category = category
  if (manufacturer !== undefined) updates.manufacturer = manufacturer

  if (Object.keys(updates).length > 0) {
    await db.update(ingredients).set(updates).where(eq(ingredients.id, id))
  }

  if (nutrition !== undefined) {
    const hasNutrition = nutrition.energyKcal100g != null && nutrition.energyKcal100g !== ''
    if (hasNutrition) {
      const micros = microsToStore(nutrition.micros)
      await db
        .insert(ingredientNutrition)
        .values({
          ingredientId: id,
          energyKcal100g: nutrition.energyKcal100g ?? null,
          protein100g: nutrition.protein100g ?? null,
          carbs100g: nutrition.carbs100g ?? null,
          sugars100g: nutrition.sugars100g ?? null,
          fat100g: nutrition.fat100g ?? null,
          saturatedFat100g: nutrition.saturatedFat100g ?? null,
          fiber100g: nutrition.fiber100g ?? null,
          salt100g: nutrition.salt100g ?? null,
          gramsPerPiece: nutrition.gramsPerPiece ?? null,
          micros,
          source: 'user',
        })
        .onDuplicateKeyUpdate({
          set: {
            energyKcal100g: nutrition.energyKcal100g ?? null,
            protein100g: nutrition.protein100g ?? null,
            carbs100g: nutrition.carbs100g ?? null,
            sugars100g: nutrition.sugars100g ?? null,
            fat100g: nutrition.fat100g ?? null,
            saturatedFat100g: nutrition.saturatedFat100g ?? null,
            fiber100g: nutrition.fiber100g ?? null,
            salt100g: nutrition.salt100g ?? null,
            gramsPerPiece: nutrition.gramsPerPiece ?? null,
            micros,
          },
        })
    } else {
      // An explicit clear (energy sent empty) removes the row rather than leaving a
      // no-energy nutrition row behind — see the POST endpoint's own reasoning: a
      // nutrition row with no energy value reads as "covered" to `computeNutrition` and
      // is worse than no row at all.
      await db.delete(ingredientNutrition).where(eq(ingredientNutrition.ingredientId, id))
    }
  }

  return { success: true }
})
