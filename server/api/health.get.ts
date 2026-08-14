/**
 * GET /api/health — liveness *and* fitness to serve.
 *
 * This endpoint is the deploy's only safety net: `deploy.yml` polls it and rolls the
 * release back if it never returns 200, and UptimeRobot watches it afterwards. It used
 * to return `200 {status:'ok'}` unconditionally — reporting `database:'disconnected'`
 * in the body while still saying 200 — which made both of those guards blind:
 *
 *   - A deploy with a bad `DATABASE_URL` smoke-tested green and stayed live.
 *   - A host missing `NUXT_PUBLIC_APP_URL` smoke-tested green too, while every browser
 *     mutation returned 403 (the CSRF check compares the request origin against
 *     `public.appUrl`, which falls back to `http://localhost:3000`) and every
 *     verification, reset and GDPR link mailed out pointed at localhost.
 *
 * Both failures are silent, catastrophic and exactly the kind this host keeps
 * producing — the deploy ships only `.output/` and `app.js`, so every runtime value
 * comes from Netcup's Node.js "custom environment variables" panel, which no deploy
 * touches. Forgetting one is the normal failure mode, not the exotic one.
 *
 * So: a real problem is a **503**, which fails the smoke test and triggers the
 * rollback that already exists. Degradations that do not stop the app from serving are
 * reported as warnings with a 200, because a rollback loop would be worse than the
 * degradation.
 *
 * The body names environment variables but never echoes their values, and never the
 * configured host — a public endpoint should not narrate the server's configuration.
 * The detail goes to the log instead.
 */
import { sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const problems: string[] = []
  const warnings: string[] = []

  // ── Database ────────────────────────────────────────────────
  let database = 'connected'
  try {
    const db = useDrizzle()
    if (!db) {
      database = 'disconnected'
    } else {
      await db.execute(sql`SELECT 1`)
    }
  } catch {
    database = 'disconnected'
  }
  if (database !== 'connected') problems.push('DATABASE_URL')

  // ── Is the app configured for the host it is actually being reached at? ──
  /**
   * Compared against the *request* host rather than against a hardcoded name, so this
   * needs no extra flag and works unchanged in dev, in CI and in production. It also
   * catches the apex-vs-`www` split, which matters more than it looks: the WebAuthn RP
   * ID is the request hostname, so a passkey enrolled on one of them does not exist on
   * the other.
   */
  const requestHost = getRequestURL(event).host
  let configuredHost = ''
  try {
    configuredHost = new URL(config.public.appUrl).host
  } catch {
    problems.push('NUXT_PUBLIC_APP_URL (not a valid URL)')
  }
  if (configuredHost && configuredHost !== requestHost) {
    problems.push('NUXT_PUBLIC_APP_URL (does not match the host this request arrived on)')
  }

  // ── Session secret ──────────────────────────────────────────
  // Sessions and the pending-2FA cookie both key off this. Too short means seal()
  // throws mid-login, which would surface as a 500 on an otherwise "healthy" release.
  const sessionPassword = config.session?.password ?? ''
  if (sessionPassword.length < 32) problems.push('NUXT_SESSION_PASSWORD (missing or under 32 characters)')

  // ── Degraded but serving ────────────────────────────────────
  // Not fatal, but each one silently disables something a user would notice.
  if (!isMailConfigured()) warnings.push('SMTP_HOST/SMTP_USER/SMTP_PASS (mail is discarded, not delivered)')
  if (!process.env.TOTP_ENCRYPTION_KEY) warnings.push('TOTP_ENCRYPTION_KEY (falling back to the session secret)')
  if (!process.env.CRON_SECRET) warnings.push('CRON_SECRET (/tasks/* refuse every request, so no sweeps run)')
  /**
   * Server-side image re-encoding fails **open** — an upload whose compression step cannot
   * run is stored as the client sent it rather than rejected. That is the right failure
   * mode, and it is also invisible: without this line, a host where the native binary never
   * loaded would look identical to one where it works, and the first symptom would be the
   * image table growing faster than anyone expected. A warning, not a problem: uploads still
   * succeed, so a rollback loop would be worse than the degradation.
   */
  if (!(await imageEncoderAvailable())) {
    warnings.push('sharp unavailable (uploads are stored as sent, without server-side WebP re-encoding)')
  }
  /**
   * Same fail-open reasoning as `sharp` above. A recipe with no uploaded photo falls back
   * to a generated OG-image card; if the rasterizer's native binary can't load on this
   * host, `og-image.get.ts` degrades to the site-wide static default instead of a broken
   * image — invisible in the app, so this is the only place it becomes observable.
   */
  if (!(await ogImageRasterizerAvailable())) {
    warnings.push('satori/@resvg/resvg-js unavailable (recipes without a photo fall back to the static OG image)')
  }

  const healthy = problems.length === 0
  const body = {
    status: healthy ? 'ok' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database,
    ...(problems.length ? { problems } : {}),
    ...(warnings.length ? { warnings } : {}),
  }

  if (!healthy) {
    // The log may say what the response must not.
    logger.error('health check failed', { problems, warnings, requestHost, configuredHost })
    setResponseStatus(event, 503)
  } else if (warnings.length) {
    logger.warn('health check degraded', { warnings })
  }

  return body
})
