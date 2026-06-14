/**
 * GET /api/tags — List all tags (optionally search)
 *
 * Query: q — partial name match
 */
import { like } from 'drizzle-orm'
import { tags } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const { q } = getQuery(event)
  const db = useDrizzle()!

  const rows = q
    ? await db
        .select({ id: tags.id, name: tags.name, nameTranslations: tags.nameTranslations })
        .from(tags)
        .where(like(tags.name, `%${String(q).toLowerCase()}%`))
        .limit(20)
    : await db
        .select({ id: tags.id, name: tags.name, nameTranslations: tags.nameTranslations })
        .from(tags)
        .limit(100)

  return rows
})
