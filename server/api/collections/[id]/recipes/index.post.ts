/**
 * POST /api/collections/:id/recipes — Add a recipe to a collection
 *
 * Owner-only (nobody else may curate someone else's list). `requireVisibleRecipe` is the
 * add-time half of the two-sided visibility check this feature depends on — the read-time
 * half lives in `by-slug/[username]/[slug].get.ts`'s own filtered join. Skipping either
 * half reopens a hole: add-time-only lets a recipe that goes private after being added
 * stay visible to strangers forever; read-time-only lets someone probe which private
 * recipes exist by trying to add them and reading the error.
 *
 * `INSERT ... ON DUPLICATE KEY UPDATE` rather than check-then-insert, so a double-click
 * race is a harmless no-op instead of a duplicate-key 500.
 */
import { z } from 'zod'
import { eq, sql } from 'drizzle-orm'
import { collections, collectionRecipes } from '~~/server/database/schema'

const addRecipeSchema = z.object({ recipeId: z.number().int().positive() })

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const collectionId = Number(getRouterParam(event, 'id'))
  if (isNaN(collectionId)) throw createError({ statusCode: 400, statusMessage: 'Invalid collection ID' })

  const body = await readBody(event)
  const result = addRecipeSchema.safeParse(body)
  if (!result.success) {
    throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: result.error.flatten().fieldErrors })
  }

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [collection] = await db
    .select({ ownerId: collections.ownerId })
    .from(collections)
    .where(eq(collections.id, collectionId))
    .limit(1)

  if (!collection) throw createError({ statusCode: 404, statusMessage: 'Collection not found' })
  if (collection.ownerId !== session.user.id) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  // Add-time visibility check: 404s if the recipe doesn't exist or is private and not
  // the caller's own.
  await requireVisibleRecipe(event, result.data.recipeId)

  await useRateLimit(`collection:recipe-toggle:${session.user.id}`, { max: 60, windowSeconds: 600 })

  await db
    .insert(collectionRecipes)
    .values({ collectionId, recipeId: result.data.recipeId })
    .onDuplicateKeyUpdate({ set: { addedAt: sql`${collectionRecipes.addedAt}` } })

  return { success: true }
})
