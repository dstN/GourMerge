/**
 * One place that answers "may this caller see this collection?" — a direct port of
 * `recipeAccess.ts`'s `requireVisibleRecipe`, same reasoning: without one shared
 * implementation, some future collection endpoint gets the 403-vs-404 distinction wrong
 * and becomes an existence oracle for private collections.
 *
 * **404, never 403, for a private collection.** A 403 confirms the id exists, and
 * collection ids are sequential integers.
 */
import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { collections } from '~~/server/database/schema'

export interface VisibleCollection {
  id: number
  ownerId: number
  visibility: 'public' | 'private'
  slug: string
  title: string
  isOwner: boolean
  viewerId: number | null
}

/**
 * Load a collection the caller is allowed to read, or throw.
 *
 * @throws 400 when the id is not a positive integer, 404 when the collection does not
 *   exist or is private and not the caller's, 503 when the database is unavailable.
 */
export async function requireVisibleCollection(event: H3Event, collectionId: number): Promise<VisibleCollection> {
  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid collection id' })
  }

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [collection] = await db
    .select({
      id: collections.id,
      ownerId: collections.ownerId,
      visibility: collections.visibility,
      slug: collections.slug,
      title: collections.title,
    })
    .from(collections)
    .where(eq(collections.id, collectionId))
    .limit(1)

  if (!collection) throw createError({ statusCode: 404, statusMessage: 'Collection not found' })

  const session = await getUserSession(event)
  const viewerId = session?.user?.id ?? null

  if (collection.visibility === 'private' && collection.ownerId !== viewerId) {
    throw createError({ statusCode: 404, statusMessage: 'Collection not found' })
  }

  return {
    id: collection.id,
    ownerId: collection.ownerId,
    visibility: collection.visibility,
    slug: collection.slug,
    title: collection.title,
    isOwner: viewerId !== null && collection.ownerId === viewerId,
    viewerId,
  }
}
