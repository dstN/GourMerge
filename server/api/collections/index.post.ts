/**
 * POST /api/collections — Create a new collection
 *
 * Same unique-slug-per-owner scheme as `POST /api/recipes`, including the same
 * reserved-slug guard (`RESERVED_RECIPE_SLUGS` — a collection lives under the same
 * `/:username/...` URL space a recipe slug could otherwise collide with).
 */
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { collections } from '~~/server/database/schema'
import { generatePublicId } from '~~/server/utils/uuid'

const createCollectionSchema = z.object({
  title: z.string().min(2).max(300),
  description: z.string().max(5000).optional(),
  visibility: z.enum(['public', 'private']).default('public'),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const body = await readBody(event)

  const result = createCollectionSchema.safeParse(body)
  if (!result.success) {
    throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: result.error.flatten().fieldErrors })
  }
  const data = result.data

  await useRateLimit(`collection:create:${session.user.id}`, { max: 20, windowSeconds: 3600 })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // ── Generate unique slug (same loop shape as recipes/index.post.ts) ─────
  let slug = generateSlug(data.title)
  let suffix = 0
  while (true) {
    const candidate = suffix === 0 ? slug : `${slug}-${suffix}`
    const [existing] = RESERVED_RECIPE_SLUGS.has(candidate)
      ? [{ id: -1 }]
      : await db
          .select({ id: collections.id })
          .from(collections)
          .where(and(eq(collections.ownerId, session.user.id), eq(collections.slug, candidate)))
          .limit(1)
    if (!existing) {
      slug = candidate
      break
    }
    suffix++
  }

  const [collection] = await db
    .insert(collections)
    .values({
      publicId: generatePublicId(),
      ownerId: session.user.id,
      title: data.title,
      slug,
      description: data.description,
      visibility: data.visibility,
    })
    .$returningId()

  if (!collection) throw createError({ statusCode: 500, statusMessage: 'Insert failed.' })

  setResponseStatus(event, 201)
  return { id: collection.id, slug }
})
