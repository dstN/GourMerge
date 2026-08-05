import { describe, test, expect } from 'vitest'
import {
  buildVerificationEmail,
  buildPasswordResetEmail,
  buildExportConfirmEmail,
  buildExportReadyEmail,
  buildDeletionConfirmEmail,
} from '../../server/utils/emailI18n'
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

/**
 * The GDPR builders carry links that either hand over every piece of personal
 * data we hold, or erase an account. A builder that dropped the URL, or fell
 * back to the wrong locale, would send someone an unusable — or wrong-language —
 * instruction at exactly the moment precision matters.
 */
describe('GDPR self-service emails', () => {
  const cases = [
    ['export confirmation', buildExportConfirmEmail],
    ['export ready', buildExportReadyEmail],
    ['deletion confirmation', buildDeletionConfirmEmail],
  ] as const

  for (const [label, build] of cases) {
    test(`${label}: carries the link in html and text`, () => {
      const mail = build('de', URL)
      expect(mail.html).toContain(URL)
      expect(mail.text).toContain(URL)
      expect(mail.subject.trim().length).toBeGreaterThan(0)
    })

    test(`${label}: differs per locale and falls back to German`, () => {
      const subjects = (['de', 'en', 'fr', 'it'] as const).map((l) => build(l, URL).subject)
      expect(new Set(subjects).size).toBe(4)

      const de = build('de', URL).subject
      expect(build(null, URL).subject).toBe(de)
      expect(build('xx', URL).subject).toBe(de)
    })
  }

  test('the deletion email never doubles as an export link', () => {
    // They land on the same confirmation page but authorise opposite actions;
    // identical copy would make the difference invisible to the recipient.
    expect(buildDeletionConfirmEmail('de', URL).subject).not.toBe(buildExportConfirmEmail('de', URL).subject)
  })
})

// Replaces the i18n parity gate for these server-only strings.
describe('EMAIL_MESSAGES parity', () => {
  const locales = Object.keys(EMAIL_MESSAGES) as Array<keyof typeof EMAIL_MESSAGES>

  // Derived from the German bundle rather than hardcoded, so a NEW bundle is
  // covered the moment it is added. The previous version listed `verification`
  // and `passwordReset` explicitly, which meant the three GDPR bundles were
  // added without the gate noticing — a missing French `exportReady.expiry`
  // would have shipped silently.
  const SECTIONS = Object.keys(EMAIL_MESSAGES.de) as Array<keyof EmailBundle>

  const keysOf = (b: EmailBundle) =>
    SECTIONS.flatMap((section) => Object.keys(b[section]).map((k) => `${section}.${k}`)).sort()

  test('contains exactly the 4 supported locales', () => {
    expect([...locales].sort()).toEqual(['de', 'en', 'fr', 'it'])
  })

  test('covers every bundle, including the GDPR self-service ones', () => {
    expect(SECTIONS.sort()).toEqual(
      ['deletionConfirm', 'exportConfirm', 'exportReady', 'passwordReset', 'verification'].sort()
    )
  })

  test('every locale has identical keys and no empty values', () => {
    const ref = keysOf(EMAIL_MESSAGES.en)
    for (const loc of locales) {
      expect(keysOf(EMAIL_MESSAGES[loc])).toEqual(ref)
      for (const section of SECTIONS) {
        for (const value of Object.values(EMAIL_MESSAGES[loc][section])) {
          expect(typeof value).toBe('string')
          expect(value.trim().length).toBeGreaterThan(0)
        }
      }
    }
  })

  // Each locale must actually be translated — copy-pasting the English bundle
  // and forgetting to translate it would otherwise pass every check above.
  test('subjects differ between locales', () => {
    for (const section of SECTIONS) {
      const subjects = locales.map((l) => EMAIL_MESSAGES[l][section].subject)
      expect(new Set(subjects).size).toBe(locales.length)
    }
  })
})
