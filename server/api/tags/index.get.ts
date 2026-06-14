/**
 * GET /api/tags — List all tags sorted by name (optionally search)
 *
 * Query: q — partial name match
 */
import { like, asc } from 'drizzle-orm'
import { tags } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const { q } = getQuery(event)
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const rows = q
    ? await db
        .select({ id: tags.id, name: tags.name, nameTranslations: tags.nameTranslations })
        .from(tags)
        .where(like(tags.name, `%${String(q).toLowerCase()}%`))
        .orderBy(asc(tags.name))
        .limit(20)
    : await db
        .select({ id: tags.id, name: tags.name, nameTranslations: tags.nameTranslations })
        .from(tags)
        .orderBy(asc(tags.name))
        .limit(100)

  return rows
})
