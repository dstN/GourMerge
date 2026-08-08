/**
 * GET /api/recipes/tour-recipe — Fetch the system tour recipe for the onboarding tour.
 *
 * Returns the recipe owned by the `system` user so the tour composable can
 * navigate to it for the fork step. Only returns a result if the requesting
 * user has NOT finished the tour yet — once finished, the recipe is invisible.
 */
import { eq } from 'drizzle-orm'
import { recipes, users } from '~~/server/database/schema'

export default defineEventHandler(async (_event) => {
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // Find the system user's recipe
  const rows = await db
    .select({
      id: recipes.id,
      slug: recipes.slug,
      title: recipes.title,
      ownerUsername: users.username,
    })
    .from(recipes)
    .innerJoin(users, eq(recipes.ownerId, users.id))
    .where(eq(users.username, 'system'))
    .limit(1)

  if (rows.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Tour recipe not found.' })
  }

  const row = rows[0]!
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    ownerUsername: row.ownerUsername,
    url: `/${row.ownerUsername}/${row.slug}`,
  }
})
