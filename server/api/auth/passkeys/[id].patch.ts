/**
 * PATCH /api/auth/passkeys/:id — rename a passkey.
 *
 * The auto-generated label is a guess from the user agent ("iPhone", "Windows"), which
 * stops being useful the moment someone has two keys on the same platform. Renaming is
 * what makes the delete button safe to use: you can only revoke the right key if you
 * can tell which one it is.
 */
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { userPasskeys } from '~~/server/database/schema'

const schema = z.object({ name: z.string().trim().min(1).max(100) })

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  await useRateLimit(getRateLimitKey(event, 'passkey-rename'), { max: 20, windowSeconds: 300 })

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid passkey id' })
  }

  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid name' })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [row] = await db
    .select({ id: userPasskeys.id })
    .from(userPasskeys)
    .where(and(eq(userPasskeys.id, id), eq(userPasskeys.userId, session.user.id)))
    .limit(1)

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Passkey not found' })

  await db.update(userPasskeys).set({ name: parsed.data.name }).where(eq(userPasskeys.id, row.id))

  return { success: true }
})
