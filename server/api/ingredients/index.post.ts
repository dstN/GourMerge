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
import { ingredients } from '~~/server/database/schema'

const createIngredientSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  /** Optional initial translations, e.g. { de: "Mehl", en: "Flour" } */
  nameTranslations: z.record(z.string(), z.string()).optional(),
  category: z.string().max(100).optional(),
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

  const { name, nameTranslations, category } = result.data
  const normalizedName = name.toLowerCase().trim()
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // Try to find existing by exact normalized name (case-insensitive via LOWER())
  const [existing] = await db
    .select({ id: ingredients.id, name: ingredients.name, nameTranslations: ingredients.nameTranslations, category: ingredients.category })
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

  setResponseStatus(event, 201)
  return {
    id: created.id,
    name: name.trim(),
    nameTranslations: nameTranslations ?? {},
    category: category ?? null,
    created: true,
  }
})
