/**
 * GET /api/ingredients/:id — Full detail for one ingredient, including nutrition.
 *
 * Used by the edit form to load current values before showing them — `GET /api/ingredients`
 * (the autocomplete search) deliberately returns a compact shape, not this one. Nothing
 * here is sensitive: an ingredient is shared catalog data, not personal content, so this is
 * public like the autocomplete itself.
 */
import { eq } from 'drizzle-orm'
import { ingredients, ingredientNutrition } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: 'Invalid ingredient id' })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [row] = await db
    .select({
      id: ingredients.id,
      name: ingredients.name,
      nameTranslations: ingredients.nameTranslations,
      category: ingredients.category,
      manufacturer: ingredients.manufacturer,
      createdBy: ingredients.createdBy,
      energyKcal100g: ingredientNutrition.energyKcal100g,
      protein100g: ingredientNutrition.protein100g,
      carbs100g: ingredientNutrition.carbs100g,
      fat100g: ingredientNutrition.fat100g,
      fiber100g: ingredientNutrition.fiber100g,
      saturatedFat100g: ingredientNutrition.saturatedFat100g,
      micros: ingredientNutrition.micros,
    })
    .from(ingredients)
    .leftJoin(ingredientNutrition, eq(ingredientNutrition.ingredientId, ingredients.id))
    .where(eq(ingredients.id, id))
    .limit(1)

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Ingredient not found' })

  const session = await getUserSession(event)
  const { createdBy, ...rest } = row

  return { ...rest, canEdit: !!session?.user && createdBy === session.user.id }
})
