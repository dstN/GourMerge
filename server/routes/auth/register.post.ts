/**
 * POST /auth/register — Create a new user account
 *
 * Validates input with Zod, hashes password, inserts user, sends the email
 * verification mail, and sets the session cookie (auto-login after registration).
 */
import { z } from 'zod'
import { eq, or } from 'drizzle-orm'
import { users } from '~~/server/database/schema'
import { issueEmailVerification, isEmailVerificationRequired } from '~~/server/utils/emailVerification'

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

  const [inserted] = await db
    .insert(users)
    .values({
      username,
      email,
      passwordHash,
      displayName: displayName || username,
    })
    .$returningId()

  if (!inserted) throw createError({ statusCode: 500, statusMessage: 'Insert failed.' })

  /**
   * ── Verification mail ───────────────────────────────────────
   * Best-effort on purpose. The account row is already committed, so throwing here
   * would answer 500 to a signup that in fact succeeded — the user would be told it
   * failed, retry, and hit the 409 for their own brand-new account. A dead SMTP host
   * must not do that. The resend button on the unverified banner is the recovery path,
   * and the failure is loud in the log.
   *
   * `preferredLocale` is left to the column default here rather than passed: the row
   * was just inserted with it, and re-reading only to choose a mail language is not
   * worth the round trip. Users change it in settings afterwards.
   */
  try {
    await issueEmailVerification({ id: inserted.id, email })
  } catch (err) {
    logger.error('registration: verification email could not be sent', { userId: inserted.id, err })
  }

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
      // A fresh account is unverified by definition — the mail above was only just sent.
      emailVerified: false,
    },
    loggedInAt: new Date().toISOString(),
    emailVerificationRequired: isEmailVerificationRequired(),
    secure: {
      userId: inserted.id,
    },
  })

  setResponseStatus(event, 201)
  return { success: true }
})
