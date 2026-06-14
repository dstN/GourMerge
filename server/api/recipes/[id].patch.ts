/**
 * PATCH /api/recipes/:id — Update recipe metadata
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { recipes } from '~~/server/database/schema'

const updateRecipeSchema = z.object({
  title: z.string().min(2).max(300).optional(),
  description: z.string().max(5000).optional(),
  servings: z.number().int().min(1).max(100).optional(),
  prepTimeMinutes: z.number().int().min(0).max(1440).optional().nullable(),
  cookTimeMinutes: z.number().int().min(0).max(1440).optional().nullable(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  visibility: z.enum(['public', 'private']).optional(),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const id = Number(getRouterParam(event, 'id'))
  if (isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid recipe ID' })
  }

  const body = await readBody(event)
  const result = updateRecipeSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Validation failed',
      data: result.error.flatten().fieldErrors,
    })
  }

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

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

  // ── Update ──────────────────────────────────────────────────
  await db.update(recipes).set(result.data).where(eq(recipes.id, id))

  return { success: true }
})
