/**
 * TOTP (RFC 6238) two-factor authentication.
 *
 * **App-agnostic by design.** The generated `otpauth://totp/…` URI uses the
 * standard defaults — SHA1, 6 digits, 30-second period — so it works in Google
 * Authenticator, Authy, 1Password, Bitwarden, Aegis, Microsoft Authenticator and
 * anything else implementing RFC 6238. Do **not** "upgrade" the algorithm or digit
 * count: Google Authenticator ignores those URI parameters and always assumes the
 * defaults, so a SHA256/8-digit secret imports without error and then produces
 * codes that never validate. Interoperability beats theoretical strength here.
 *
 * **Entirely opt-in.** A user with no `user_totp` row logs in with just a password,
 * exactly as before; nothing in the login path changes for them. Enrolment happens
 * in `/settings` and can be undone there. Nothing in the codebase requires 2FA, and
 * no account is enrolled by default.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { Secret, TOTP } from 'otpauth'

/** Standard parameters — see the file header before changing any of these. */
const ISSUER = 'GourMerge'
const ALGORITHM = 'SHA1'
const DIGITS = 6
const PERIOD = 30
/** Accept the neighbouring steps, tolerating ~±30s of device clock drift. */
const VALIDATION_WINDOW = 1

const RECOVERY_CODE_COUNT = 10
/** Crockford-ish alphabet: no 0/O/1/I/L, so a hand-copied code is unambiguous. */
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const RECOVERY_GROUP = 5

/**
 * Key for encrypting TOTP secrets at rest.
 *
 * A plaintext secret is a bearer token for the account: anyone with a DB dump could
 * generate valid codes forever, which would make 2FA theatre. Derived from
 * `TOTP_ENCRYPTION_KEY` when set; otherwise from `NUXT_SESSION_PASSWORD` so a
 * fresh install works without a second secret to provision — but the dedicated
 * variable is strongly preferred, because rotating the session password would
 * otherwise invalidate every enrolled authenticator at once.
 */
function encryptionKey(): Buffer {
  const raw = process.env.TOTP_ENCRYPTION_KEY || process.env.NUXT_SESSION_PASSWORD
  if (!raw || raw.length < 32) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Two-factor authentication is not configured on this server.',
    })
  }
  // A fixed-salt SHA-256 is sufficient: the input is already a high-entropy secret,
  // not a user password, so there is nothing to slow down for an attacker.
  return createHash('sha256').update(`gourmerge:totp:${raw}`).digest()
}

/** AES-256-GCM. Layout: `iv:authTag:ciphertext`, all base64. */
export function encryptSecret(base32Secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const enc = Buffer.concat([cipher.update(base32Secret, 'utf8'), cipher.final()])
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':')
}

export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(':')
  if (!ivB64 || !tagB64 || !dataB64) {
    throw createError({ statusCode: 500, statusMessage: 'Stored two-factor secret is malformed.' })
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}

/** A fresh 160-bit secret, the size RFC 4226 recommends for HMAC-SHA1. */
export function generateSecret(): string {
  return new Secret({ size: 20 }).base32
}

function totpFor(base32Secret: string, accountLabel: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label: accountLabel,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(base32Secret),
  })
}

/**
 * The enrolment URI to encode as a QR code. Also shown as text, because some
 * authenticator apps (and anyone on a desktop without a camera) need manual entry.
 */
export function buildOtpauthUri(base32Secret: string, accountLabel: string): string {
  return totpFor(base32Secret, accountLabel).toString()
}

/**
 * Verify a 6-digit code.
 *
 * Returns the accepted time step so the caller can persist it: a code stays valid
 * for its whole 30-second window, so without rejecting steps at or below the last
 * accepted one, an intercepted code could be replayed inside that window.
 */
export function verifyTotp(
  base32Secret: string,
  token: string,
  lastUsedCounter: number | null
): { valid: boolean; counter?: number } {
  const normalized = token.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(normalized)) return { valid: false }

  const totp = totpFor(base32Secret, 'verify')
  const delta = totp.validate({ token: normalized, window: VALIDATION_WINDOW })
  if (delta === null) return { valid: false }

  const counter = Math.floor(Date.now() / 1000 / PERIOD) + delta
  if (lastUsedCounter !== null && counter <= lastUsedCounter) return { valid: false }

  return { valid: true, counter }
}

/** Human-transcribable recovery codes, e.g. `A3F9K-TM2QX`. */
export function generateRecoveryCodes(): string[] {
  const codes: string[] = []
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const chars: string[] = []
    // `randomBytes`, not Math.random: these are credentials.
    const bytes = randomBytes(RECOVERY_GROUP * 2)
    for (let j = 0; j < RECOVERY_GROUP * 2; j++) {
      chars.push(RECOVERY_ALPHABET[bytes[j]! % RECOVERY_ALPHABET.length]!)
    }
    codes.push(`${chars.slice(0, RECOVERY_GROUP).join('')}-${chars.slice(RECOVERY_GROUP).join('')}`)
  }
  return codes
}

/** Normalize user input so case and stray spaces don't reject a valid code. */
export function normalizeRecoveryCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '')
}

/**
 * Constant-time compare for equal-length secrets. Used where a plain `===` would
 * leak length/prefix information through timing.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
