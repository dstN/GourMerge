import { z } from 'zod'
import { contactMessages } from '~~/server/database/schema'
import { useRateLimit, getRateLimitKey } from '~~/server/utils/rateLimit'

const bodySchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  message: z.string().min(10).max(2000),
  honeypot: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)

  // Bot trap — return silently if honeypot field is filled
  if (body.honeypot) {
    return { ok: true }
  }

  // Rate limit: 5 requests per IP per hour
  const key = getRateLimitKey(event, 'contact:submit')
  await useRateLimit(key, { max: 5, windowSeconds: 3600 })

  const db = useDrizzle()
  await db.insert(contactMessages).values({
    name: body.name,
    email: body.email,
    message: body.message,
  })

  return { ok: true }
})
