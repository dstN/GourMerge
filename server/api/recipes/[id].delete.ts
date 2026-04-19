/**
 * DELETE /api/recipes/:id — Delete a recipe
 */
import { eq } from 'drizzle-orm'
import { recipes } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const id = Number(getRouterParam(event, 'id'))
  if (isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid recipe ID' })
  }

  const db = useDrizzle()

  // ── Verify ownership ────────────────────────────────────────
  const [recipe] = await db
    .select({ ownerId: recipes.ownerId })
    .from(recipes)
    .where(eq(recipes.id, id))
    .limit(1)

  if (!recipe) {
    throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
  }
  if (recipe.ownerId !== session.user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  // ── Delete (cascades via foreign keys) ──────────────────────
  await db.delete(recipes).where(eq(recipes.id, id))

  return { success: true }
})
