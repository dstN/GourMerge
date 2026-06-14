/**
 * POST /api/recipes/:id/tags — Attach or detach a tag from a recipe
 *
 * Body: { name: string, action: 'attach' | 'detach' }
 * Creates the tag if it doesn't exist (deduped by lowercase name).
 */
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { recipes, tags, recipeTags } from '~~/server/database/schema'

const tagsSchema = z.object({
  name: z.string().min(1).max(100),
  action: z.enum(['attach', 'detach']),
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

  const db = useDrizzle()!

  // Verify ownership
  const [recipe] = await db
    .select({ ownerId: recipes.ownerId })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1)

  if (!recipe) {
    throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
  }
  if (recipe.ownerId !== session.user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const tagName = result.data.name.toLowerCase().trim()

  // Find or create tag
  let [tag] = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(eq(tags.name, tagName))
    .limit(1)

  if (!tag && result.data.action === 'attach') {
    const [inserted] = await db.insert(tags).values({ name: tagName }).$returningId()
    tag = { id: inserted.id, name: tagName }
  }

  if (!tag) {
    return { success: true, action: 'noop' }
  }

  if (result.data.action === 'attach') {
    // Ignore duplicate (ON DUPLICATE KEY via unique index)
    try {
      await db.insert(recipeTags).values({ recipeId, tagId: tag.id })
    } catch {
      // Tag already attached — not an error
    }
  } else {
    await db
      .delete(recipeTags)
      .where(and(eq(recipeTags.recipeId, recipeId), eq(recipeTags.tagId, tag.id)))
  }

  return { success: true, action: result.data.action, tag: { id: tag.id, name: tag.name } }
})
