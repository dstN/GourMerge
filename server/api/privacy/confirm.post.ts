/**
 * POST /api/privacy/confirm — the account owner clicked the link in their inbox.
 *
 * For an EXPORT this is the whole authorisation step: the window is extended to
 * 24h and the same token becomes the download credential. It stays multi-use on
 * purpose, because the link is also emailed — a one-shot token would be burned
 * by whichever of the two the user opened first.
 *
 * For a DELETION this only records the confirmation. The destructive part waits
 * for a second, explicit call with the chosen scope, so that merely opening a
 * link from an inbox can never erase an account.
 */
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { dataRequests } from '~~/server/database/schema'
import { resolveDataRequest } from '~~/server/utils/dataRequest'
import { useRateLimit, getRateLimitKey } from '~~/server/utils/rateLimit'
import { sendMail } from '~~/server/utils/mailer'
import { buildExportReadyEmail } from '~~/server/utils/emailI18n'
import { logger } from '~~/server/utils/logger'

const bodySchema = z.object({ token: z.string().min(32).max(128) })

/** Download window, as agreed: the emailed link is good for a day. */
const DOWNLOAD_TTL_MS = 1000 * 60 * 60 * 24

export default defineEventHandler(async (event) => {
  await useRateLimit(getRateLimitKey(event, 'privacy:confirm'), { max: 20, windowSeconds: 3600 })

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid token.' })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Service unavailable.' })

  const req = await resolveDataRequest(db, parsed.data.token)

  if (req.type === 'deletion') {
    if (!req.confirmedAt) {
      await db.update(dataRequests).set({ confirmedAt: new Date() }).where(eq(dataRequests.id, req.id))
    }
    // The client now shows the scope choice and calls /api/privacy/delete.
    return { type: 'deletion' as const, confirmed: true, username: req.username }
  }

  const appUrl = useRuntimeConfig().public.appUrl.replace(/\/$/, '')
  const downloadUrl = `${appUrl}/api/privacy/export?token=${parsed.data.token}`

  // Only extend and mail on the FIRST confirmation. Re-opening the link later
  // must not silently renew the 24h window or send another copy.
  if (!req.confirmedAt) {
    const expiresAt = new Date(Date.now() + DOWNLOAD_TTL_MS)
    await db.update(dataRequests).set({ confirmedAt: new Date(), expiresAt }).where(eq(dataRequests.id, req.id))

    const message = buildExportReadyEmail(req.preferredLocale, downloadUrl)
    await sendMail({ to: req.email, ...message })

    logger.info('gdpr export confirmed', { requestId: req.id })
  }

  return { type: 'export' as const, confirmed: true, downloadUrl }
})
