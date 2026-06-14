/**
 * POST /auth/register — Create a new user account
 *
 * Validates input with Zod, hashes password, inserts user,
 * and sets the session cookie (auto-login after registration).
 */
import { z } from 'zod'
import { eq, or } from 'drizzle-orm'
import { users } from '~~/server/database/schema'

const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().max(100).optional(),
})

export default defineEventHandler(async (event) => {
  // ── Rate limit: 3 attempts per minute per IP ──────────────
  const key = getRateLimitKey(event, 'register')
  await useRateLimit(key, { max: 3, windowSeconds: 60 })

  const body = await readBody(event)

  // ── Validate input ──────────────────────────────────────────
  const result = registerSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Validation failed',
      data: result.error.flatten().fieldErrors,
    })
  }

  const { username, email, password, displayName } = result.data
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  // ── Check for existing user ─────────────────────────────────
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.email, email), eq(users.username, username)))
    .limit(1)

  if (existing.length > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'A user with this email or username already exists',
    })
  }

  // ── Hash password & insert ──────────────────────────────────
  const passwordHash = await hashPassword(password)

  const [inserted] = await db.insert(users).values({
    username,
    email,
    passwordHash,
    displayName: displayName || username,
  }).$returningId()

  if (!inserted) throw createError({ statusCode: 500, statusMessage: 'Insert failed.' })

  // ── Session rotation: clear any pre-existing session (prevents fixation) ──
  await clearUserSession(event)

  // ── Set session ─────────────────────────────────────────────
  await setUserSession(event, {
    user: {
      id: inserted.id,
      username,
      displayName: displayName || username,
      email,
      avatarUrl: null,
    },
    loggedInAt: new Date().toISOString(),
    secure: {
      userId: inserted.id,
    },
  })

  setResponseStatus(event, 201)
  return { success: true }
})
