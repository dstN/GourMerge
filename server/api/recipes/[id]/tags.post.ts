/**
 * POST /api/recipes/:id/tags — Replace the full tag set for a recipe
 *
 * Body: { tags: string[] }
 * Creates tags if they don't exist, deletes all existing associations, then inserts new ones.
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { recipes, tags, recipeTags } from '~~/server/database/schema'

const tagsSchema = z.object({
  tags: z.array(z.string().min(1).max(100)).max(50),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const recipeId = Number(getRouterParam(event, 'id'))
  if (isNaN(recipeId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid recipe ID' })
  }

  const body = await readBody(event)
  const result = tagsSchema.safeParse(body)
  if (!result.success) {
    throw createError({ statusCode: 422, statusMessage: 'Validation failed' })
  }

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // Verify ownership
  const [recipe] = await db.select({ ownerId: recipes.ownerId }).from(recipes).where(eq(recipes.id, recipeId)).limit(1)

  if (!recipe) {
    throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
  }
  if (recipe.ownerId !== session.user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  await useRateLimit(`recipe:tags:${session.user.id}`, { max: 60, windowSeconds: 600 })

  const tagNames = result.data.tags.map((t) => t.toLowerCase().trim()).filter(Boolean)

  // Upsert each tag and collect IDs
  const tagIds: number[] = []
  for (const tagName of tagNames) {
    const [existing] = await db.select({ id: tags.id }).from(tags).where(eq(tags.name, tagName)).limit(1)

    if (existing) {
      tagIds.push(existing.id)
    } else {
      const [inserted] = await db.insert(tags).values({ name: tagName }).$returningId()
      if (inserted) tagIds.push(inserted.id)
    }
  }

  // Replace all tag associations
  await db.delete(recipeTags).where(eq(recipeTags.recipeId, recipeId))

  if (tagIds.length > 0) {
    await db.insert(recipeTags).values(tagIds.map((tagId) => ({ recipeId, tagId })))
  }

  return { ok: true }
})
