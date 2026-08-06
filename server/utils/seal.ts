/**
 * Minimal authenticated-payload sealing for short-lived server-issued cookies.
 *
 * Layout: `base64url(json).base64url(hmac-sha256)`. Not encryption — the payload is
 * only a user id and a timestamp, neither secret — but it is **tamper-proof**, which
 * is what matters: a forged `{ userId }` would let anyone skip the second factor.
 *
 * Uses `NUXT_SESSION_PASSWORD` as the key, so it shares the session's trust root
 * and rotating that secret invalidates these cookies too, which is the desired
 * behaviour for a five-minute token.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

function key(): string {
  const raw = process.env.NUXT_SESSION_PASSWORD
  if (!raw || raw.length < 32) {
    throw createError({ statusCode: 500, statusMessage: 'Session secret is not configured.' })
  }
  return raw
}

const b64u = {
  encode: (buf: Buffer) => buf.toString('base64url'),
  decode: (str: string) => Buffer.from(str, 'base64url'),
}

function sign(body: string): string {
  return b64u.encode(createHmac('sha256', key()).update(body).digest())
}

export async function seal(payload: unknown): Promise<string> {
  const body = b64u.encode(Buffer.from(JSON.stringify(payload), 'utf8'))
  return `${body}.${sign(body)}`
}

export async function unseal<T>(token: string): Promise<T | null> {
  const [body, mac] = token.split('.')
  if (!body || !mac) return null

  const expected = Buffer.from(sign(body))
  const actual = Buffer.from(mac)
  // Constant-time: a fast-fail compare would leak how much of the MAC matched.
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null

  try {
    return JSON.parse(b64u.decode(body).toString('utf8')) as T
  } catch {
    return null
  }
}
