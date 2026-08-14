/**
 * GET /api/users/search?q=&limit= — Username/display-name autocomplete for @mentions
 *
 * Session-gated (a compose-time helper, not a public directory) and, unlike most
 * autocomplete-shaped GETs in this app, rate-limited — this one returns real people's
 * usernames rather than catalogue entries.
 */
import { z } from 'zod'
import { and, eq, like, or } from 'drizzle-orm'
import { users } from '~~/server/database/schema'

const searchSchema = z.object({
  q: z.string().trim().min(1).max(50),
  limit: z.coerce.number().int().min(1).max(20).default(8),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const result = searchSchema.safeParse(getQuery(event))
  if (!result.success) throw createError({ statusCode: 400, statusMessage: 'Invalid query params' })
  const { q, limit } = result.data

  await useRateLimit(`user:search:${session.user.id}`, { max: 60, windowSeconds: 600 })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const qLike = `${escapeLikePattern(q)}%`
  const rows = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(and(eq(users.isGhost, false), or(like(users.username, qLike), like(users.displayName, qLike))))
    .limit(limit)

  // Exact username match first — mirrors the ingredient autocomplete's own promotion rule.
  const qLower = q.toLowerCase()
  rows.sort((a, b) => Number(b.username.toLowerCase() === qLower) - Number(a.username.toLowerCase() === qLower))

  return rows
})
