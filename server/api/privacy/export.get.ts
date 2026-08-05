/**
 * GET /api/privacy/export?token=… — download the data export (GDPR Art. 15/20).
 *
 * A GET with the token in the query so the emailed link is clickable. That does
 * put the token in the URL, which is why the window is short, the row is
 * single-purpose, and the response is marked no-store: a browser that cached
 * this would leave a full personal-data dump in the disk cache.
 */
import { z } from 'zod'
import { resolveDataRequest } from '~~/server/utils/dataRequest'
import { buildDataExport } from '~~/server/utils/dataExport'
import { useRateLimit, getRateLimitKey } from '~~/server/utils/rateLimit'
import { logger } from '~~/server/utils/logger'

const querySchema = z.object({ token: z.string().min(32).max(128) })

export default defineEventHandler(async (event) => {
  await useRateLimit(getRateLimitKey(event, 'privacy:export'), { max: 10, windowSeconds: 3600 })

  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid token.' })

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Service unavailable.' })

  const req = await resolveDataRequest(db, parsed.data.token, 'export')

  // Confirming is what authorises the download; an unconfirmed token only
  // proves someone reached the endpoint, not that they read the inbox.
  if (!req.confirmedAt) {
    throw createError({ statusCode: 400, statusMessage: 'This link has not been confirmed yet.' })
  }

  const data = await buildDataExport(db, req.userId)
  const stamp = new Date().toISOString().slice(0, 10)

  logger.info('gdpr export downloaded', { requestId: req.id, userId: req.userId })

  setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="gourmerge-export-${req.username}-${stamp}.json"`)
  // Belt and braces: keep this out of shared caches and browser history caches.
  setHeader(event, 'Cache-Control', 'no-store, max-age=0')
  setHeader(event, 'X-Robots-Tag', 'noindex, nofollow')

  return JSON.stringify(data, null, 2)
})
