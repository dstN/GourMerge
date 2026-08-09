/**
 * DELETE /api/recipes/:id/image — remove the recipe photo. Owner only.
 */
import { eq } from 'drizzle-orm'
import { recipeImages } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const recipeId = Number(getRouterParam(event, 'id'))
  const recipe = await requireVisibleRecipe(event, recipeId)
  if (!recipe.isOwner) throw createError({ statusCode: 403, statusMessage: 'Not the recipe owner' })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  await db.delete(recipeImages).where(eq(recipeImages.recipeId, recipe.id))
  return { success: true }
})
