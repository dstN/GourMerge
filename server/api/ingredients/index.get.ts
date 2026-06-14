/**
 * GET /api/ingredients?q=&locale=&limit=
 *
 * Search the global ingredients master table by name.
 * Used by the IngredientAutocomplete component.
 *
 * Locale-aware: if a matching translation exists in the requested locale,
 * it's returned as `localeName` for display; the canonical English `name` is
 * always included for dedup/ID purposes.
 */
import { z } from 'zod'
import { like } from 'drizzle-orm'
import { ingredients } from '~~/server/database/schema'

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
    })
    .from(ingredients)
    .where(like(ingredients.name, `${q}%`))
    .limit(limit)

  return rows.map((row) => {
    const translations = (row.nameTranslations ?? {}) as Record<string, string>
    return {
      id: row.id,
      name: row.name,
      localeName: translations[locale] ?? translations['en'] ?? row.name,
      category: row.category,
    }
  })
})
