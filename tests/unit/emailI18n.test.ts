import { describe, test, expect } from 'vitest'
import { buildVerificationEmail, buildPasswordResetEmail } from '../../server/utils/emailI18n'
import { EMAIL_MESSAGES, type EmailBundle } from '../../server/utils/emailMessages'

const URL = 'https://gourmerge.app/auth/verify?token=abc'

describe('buildVerificationEmail', () => {
  test('embeds the URL in both html and text', () => {
    const mail = buildVerificationEmail('en', URL)
    expect(mail.html).toContain(URL)
    expect(mail.text).toContain(URL)
    expect(mail.subject.length).toBeGreaterThan(0)
  })

  test('localizes the subject per locale', () => {
    expect(buildVerificationEmail('en', URL).subject).toMatch(/verify/i)
    expect(buildVerificationEmail('de', URL).subject).toMatch(/bestätige/i)
    expect(buildVerificationEmail('fr', URL).subject).toMatch(/confirme/i)
    expect(buildVerificationEmail('it', URL).subject).toMatch(/conferma/i)
  })

  test('falls back to German for unknown/empty locale', () => {
    const de = buildVerificationEmail('de', URL).subject
    expect(buildVerificationEmail(null, URL).subject).toBe(de)
    expect(buildVerificationEmail(undefined, URL).subject).toBe(de)
    expect(buildVerificationEmail('xx', URL).subject).toBe(de)
  })
})

describe('buildPasswordResetEmail', () => {
  test('embeds the URL and localizes the subject', () => {
    const mail = buildPasswordResetEmail('en', URL)
    expect(mail.html).toContain(URL)
    expect(mail.text).toContain(URL)
    expect(mail.subject).toMatch(/reset/i)
  })

  test('verification and reset subjects differ within a locale', () => {
    expect(buildPasswordResetEmail('de', URL).subject).not.toBe(buildVerificationEmail('de', URL).subject)
  })
})

// Replaces the i18n parity gate for these server-only strings.
describe('EMAIL_MESSAGES parity', () => {
  const locales = Object.keys(EMAIL_MESSAGES) as Array<keyof typeof EMAIL_MESSAGES>
  const keysOf = (b: EmailBundle) =>
    [
      ...Object.keys(b.verification).map((k) => `verification.${k}`),
      ...Object.keys(b.passwordReset).map((k) => `passwordReset.${k}`),
    ].sort()

  test('contains exactly the 4 supported locales', () => {
    expect([...locales].sort()).toEqual(['de', 'en', 'fr', 'it'])
  })

  test('every locale has identical keys and no empty values', () => {
    const ref = keysOf(EMAIL_MESSAGES.en)
    for (const loc of locales) {
      expect(keysOf(EMAIL_MESSAGES[loc])).toEqual(ref)
      for (const section of [EMAIL_MESSAGES[loc].verification, EMAIL_MESSAGES[loc].passwordReset]) {
        for (const value of Object.values(section)) {
          expect(typeof value).toBe('string')
          expect(value.trim().length).toBeGreaterThan(0)
        }
      }
    }
  })
})
