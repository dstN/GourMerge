/**
 * GET /api/ingredients?q=&locale=&limit=
 *
 * Search the global ingredients master table by name, all locale names, and synonyms.
 * Used by the IngredientAutocomplete component.
 *
 * Locale-aware: if a matching translation exists in the requested locale,
 * it's returned as `localeName` for display; the canonical English `name` is
 * always included for dedup/ID purposes.
 *
 * Includes compact nutrition summary (kcal + macros) and `hasNutrition` flag.
 */
import { z } from 'zod'
import { like, or, sql } from 'drizzle-orm'
import { ingredients, ingredientNutrition } from '~~/server/database/schema'

const querySchema = z.object({
  q: z.string().min(1).max(100),
  locale: z.string().max(10).default('de'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const result = querySchema.safeParse(query)
  if (!result.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid query params' })
  }

  const { q, locale, limit } = result.data
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const rows = await db
    .select({
      id: ingredients.id,
      name: ingredients.name,
      nameTranslations: ingredients.nameTranslations,
      category: ingredients.category,
      synonyms: ingredients.synonyms,
      energyKcal100g: ingredientNutrition.energyKcal100g,
      protein100g: ingredientNutrition.protein100g,
      carbs100g: ingredientNutrition.carbs100g,
      fat100g: ingredientNutrition.fat100g,
      fiber100g: ingredientNutrition.fiber100g,
      densityGPerMl: ingredientNutrition.densityGPerMl,
    })
    .from(ingredients)
    .leftJoin(ingredientNutrition, sql`${ingredientNutrition.ingredientId} = ${ingredients.id}`)
    .where(
      or(
        like(ingredients.name, `${q}%`),
        // Match any locale name in nameTranslations JSON
        sql`JSON_UNQUOTE(JSON_EXTRACT(${ingredients.nameTranslations}, ${`$.${locale}`})) LIKE ${`${q}%`}`,
        sql`JSON_UNQUOTE(JSON_EXTRACT(${ingredients.nameTranslations}, '$.de')) LIKE ${`${q}%`}`,
        sql`JSON_UNQUOTE(JSON_EXTRACT(${ingredients.nameTranslations}, '$.en')) LIKE ${`${q}%`}`,
        sql`JSON_UNQUOTE(JSON_EXTRACT(${ingredients.nameTranslations}, '$.fr')) LIKE ${`${q}%`}`,
        sql`JSON_UNQUOTE(JSON_EXTRACT(${ingredients.nameTranslations}, '$.it')) LIKE ${`${q}%`}`,
        // Match synonyms for the current locale
        sql`JSON_SEARCH(${ingredients.synonyms}, 'one', ${`${q}%`}, NULL, ${`$.${locale}[*]`}) IS NOT NULL`,
      )
    )
    .limit(limit)

  return rows.map((row) => {
    const translations = (row.nameTranslations ?? {}) as Record<string, string>
    const hasNutrition = row.energyKcal100g !== null
    return {
      id: row.id,
      name: row.name,
      localeName: translations[locale] ?? translations['en'] ?? row.name,
      category: row.category,
      hasNutrition,
      nutrition: hasNutrition ? {
        kcal: row.energyKcal100g ? parseFloat(row.energyKcal100g) : null,
        protein: row.protein100g ? parseFloat(row.protein100g) : null,
        carbs: row.carbs100g ? parseFloat(row.carbs100g) : null,
        fat: row.fat100g ? parseFloat(row.fat100g) : null,
        fiber: row.fiber100g ? parseFloat(row.fiber100g) : null,
        densityGPerMl: row.densityGPerMl ? parseFloat(row.densityGPerMl) : null,
      } : null,
    }
  })
})
