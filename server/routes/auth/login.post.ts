/**
 * POST /auth/login — Authenticate an existing user
 *
 * Validates credentials, verifies password hash, sets session cookie.
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { users } from '~~/server/database/schema'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // ── Validate ────────────────────────────────────────────────
  const result = loginSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Invalid credentials format',
    })
  }

  const { email, password } = result.data
  const db = useDrizzle()

  // ── Find user ───────────────────────────────────────────────
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid email or password',
    })
  }

  // ── Verify password ─────────────────────────────────────────
  const valid = await verifyPassword(user.passwordHash, password)
  if (!valid) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid email or password',
    })
  }

  // ── Set session ─────────────────────────────────────────────
  await setUserSession(event, {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
    loggedInAt: new Date().toISOString(),
    secure: {
      userId: user.id,
    },
  })

  return { success: true }
})
