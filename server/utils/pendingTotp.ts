/**
 * The short-lived "password accepted, second factor still owed" state.
 *
 * Kept in its **own signed, httpOnly cookie**, never in the user session. That is
 * the whole point: if the half-authenticated state lived in the session,
 * `requireUserSession()` would already succeed and every protected endpoint would be
 * reachable with only a password — the second factor would be decorative.
 *
 * The cookie carries only the user id and an issue timestamp, sealed with the
 * session password so it cannot be forged, and expires after five minutes.
 */
import { seal, unseal } from './seal'

const COOKIE_NAME = 'gm_totp_pending'
const TTL_SECONDS = 5 * 60

interface PendingPayload {
  userId: number
  issuedAt: number
}

export async function setPendingTotp(event: Parameters<typeof setCookie>[0], userId: number): Promise<void> {
  const token = await seal({ userId, issuedAt: Date.now() } satisfies PendingPayload)
  setCookie(event, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TTL_SECONDS,
  })
}

export async function readPendingTotp(event: Parameters<typeof getCookie>[0]): Promise<number | null> {
  const token = getCookie(event, COOKIE_NAME)
  if (!token) return null

  const payload = await unseal<PendingPayload>(token)
  if (!payload) return null

  // Belt and braces: the cookie maxAge already expires it, but a client can keep
  // sending an expired cookie, so the timestamp is authoritative.
  if (Date.now() - payload.issuedAt > TTL_SECONDS * 1000) return null

  return payload.userId
}

export function clearPendingTotp(event: Parameters<typeof deleteCookie>[0]): void {
  deleteCookie(event, COOKIE_NAME, { path: '/' })
}
