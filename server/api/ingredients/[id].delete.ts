/**
 * DELETE /api/ingredients/:id — Remove an ingredient the caller created.
 *
 * Same ownership rule as the PATCH endpoint: only `created_by === session.user.id`, 404 (not
 * 403) for anyone else, never the Swiss BLV rows. This exists for the typo case — you typed
 * "Mehl" wrong, created a duplicate, and want it gone before anyone else ever sees it.
 *
 * `recipe_commit_ingredients.ingredient_id` has no `onDelete` clause (see schema.ts), so MySQL
 * enforces RESTRICT by default: once a commit — even a since-superseded one — has snapshotted
 * this ingredient, the FK blocks the delete outright. That is correct for this app's
 * immutable-history model (you cannot rewrite a past commit out from under it), so it is
 * checked explicitly here and turned into a clean 409 rather than a raw driver error.
 */
import { eq } from 'drizzle-orm'
import { ingredients, recipeCommitIngredients } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: 'Invalid ingredient id' })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [existing] = await db
    .select({ createdBy: ingredients.createdBy })
    .from(ingredients)
    .where(eq(ingredients.id, id))
    .limit(1)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Ingredient not found' })
  if (existing.createdBy !== session.user.id) {
    throw createError({ statusCode: 404, statusMessage: 'Ingredient not found' })
  }

  await useRateLimit(`ingredient:delete:${session.user.id}`, { max: 20, windowSeconds: 600 })

  const [usedIn] = await db
    .select({ id: recipeCommitIngredients.id })
    .from(recipeCommitIngredients)
    .where(eq(recipeCommitIngredients.ingredientId, id))
    .limit(1)
  if (usedIn) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Ingredient is used in one or more recipes and cannot be deleted.',
      data: { code: 'ingredient_in_use' },
    })
  }

  // `ingredient_nutrition` cascades on delete (schema.ts) — no separate cleanup needed.
  await db.delete(ingredients).where(eq(ingredients.id, id))

  return { success: true }
})
