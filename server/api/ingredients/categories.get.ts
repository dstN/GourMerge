/**
 * GET /api/ingredients/categories — the distinct categories already in use.
 *
 * Feeds the category picker in the new-ingredient dialog. A free-text field there would
 * fragment the vocabulary within a week ("Gemüse", "gemuese", "Vegetables"), and category
 * is what the autocomplete shows as a badge — so it is only useful if it stays consistent.
 *
 * Public read, like the ingredient search itself: this is reference data, not user data.
 */
import { isNotNull, sql } from 'drizzle-orm'
import { ingredients } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  setHeader(event, 'cache-control', 'public, max-age=300')

  const rows = await db
    .selectDistinct({ category: ingredients.category })
    .from(ingredients)
    .where(isNotNull(ingredients.category))
    .orderBy(sql`${ingredients.category} ASC`)

  return rows.map((r) => r.category).filter((c): c is string => !!c)
})
