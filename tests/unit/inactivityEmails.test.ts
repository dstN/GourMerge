import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildInactivityEmail, INACTIVITY_MESSAGES } from '../../server/utils/inactivityEmails'

const LOCALES = ['de', 'en', 'fr', 'it'] as const
const STAGES = ['sixMonths', 'fourWeeks', 'finalDay'] as const
const LOGIN_URL = 'https://gourmerge.de/auth/login'
const DUE = new Date('2027-03-14T00:00:00Z')

describe('parity', () => {
  test('every locale has every stage with every field filled', () => {
    for (const loc of LOCALES) {
      for (const stage of STAGES) {
        const s = INACTIVITY_MESSAGES[loc]?.[stage]
        expect(s, `${loc}.${stage} missing`).toBeDefined()
        for (const field of ['subject', 'intro', 'linkLabel', 'outro'] as const) {
          expect(s[field]?.length, `${loc}.${stage}.${field} empty`).toBeGreaterThan(0)
        }
      }
    }
  })

  test('the cron script reads the same JSON as the app', () => {
    // The nightly job runs as plain Node with no TS pipeline, so the copy lives in
    // JSON that both consumers read. If someone re-inlines it into the .ts module,
    // cron mail and app mail would drift silently — this asserts they cannot.
    const json = JSON.parse(readFileSync(resolve('server/utils/inactivityMessages.json'), 'utf8'))
    expect(json).toEqual(INACTIVITY_MESSAGES)

    const script = readFileSync(resolve('scripts/inactive-accounts.mjs'), 'utf8')
    expect(script).toContain('inactivityMessages.json')
  })
})

describe('content rules', () => {
  test('every notice states that logging in is enough', () => {
    // The whole point of a warning is that the reader knows what to do. Each locale
    // asserts on its own verb, because a generic check would pass on empty copy.
    const verb = { de: /anzumelden|anmeld/i, en: /signing in|sign in/i, fr: /connecter/i, it: /accede|accedere/i }
    for (const loc of LOCALES) {
      for (const stage of STAGES) {
        const mail = buildInactivityEmail(loc, stage, LOGIN_URL, DUE)
        expect(`${mail.text}`, `${loc}.${stage}`).toMatch(verb[loc])
      }
    }
  })

  test('every notice names the deletion date', () => {
    for (const loc of LOCALES) {
      for (const stage of STAGES) {
        const mail = buildInactivityEmail(loc, stage, LOGIN_URL, DUE)
        // 2027 is the year of DUE; a notice without a date is not a real warning.
        expect(mail.text, `${loc}.${stage} text`).toContain('2027')
        expect(mail.html, `${loc}.${stage} html`).toContain('2027')
      }
    }
  })

  test('no placeholder survives into the output', () => {
    for (const loc of LOCALES) {
      for (const stage of STAGES) {
        const mail = buildInactivityEmail(loc, stage, LOGIN_URL, DUE)
        expect(mail.text).not.toContain('{date}')
        expect(mail.html).not.toContain('{date}')
        expect(mail.subject).not.toContain('{')
      }
    }
  })

  test('embeds the login URL in both parts', () => {
    for (const loc of LOCALES) {
      const mail = buildInactivityEmail(loc, 'finalDay', LOGIN_URL, DUE)
      expect(mail.text).toContain(LOGIN_URL)
      expect(mail.html).toContain(`href="${LOGIN_URL}"`)
    }
  })
})

describe('localization', () => {
  test('formats the date in the recipient locale', () => {
    // German writes "14. März 2027"; English "14 March 2027". A date rendered in the
    // wrong locale is the kind of detail that makes an automated mail feel like spam.
    expect(buildInactivityEmail('de', 'finalDay', LOGIN_URL, DUE).text).toMatch(/März/)
    expect(buildInactivityEmail('en', 'finalDay', LOGIN_URL, DUE).text).toMatch(/March/)
    expect(buildInactivityEmail('fr', 'finalDay', LOGIN_URL, DUE).text).toMatch(/mars/)
    expect(buildInactivityEmail('it', 'finalDay', LOGIN_URL, DUE).text).toMatch(/marzo/)
  })

  test('subjects differ per stage, so the escalation is visible in an inbox', () => {
    for (const loc of LOCALES) {
      const subjects = STAGES.map((s) => buildInactivityEmail(loc, s, LOGIN_URL, DUE).subject)
      expect(new Set(subjects).size, `${loc} reuses a subject`).toBe(STAGES.length)
    }
  })

  test('falls back to German for an unknown or missing locale', () => {
    const de = buildInactivityEmail('de', 'sixMonths', LOGIN_URL, DUE).subject
    expect(buildInactivityEmail(null, 'sixMonths', LOGIN_URL, DUE).subject).toBe(de)
    expect(buildInactivityEmail(undefined, 'sixMonths', LOGIN_URL, DUE).subject).toBe(de)
    expect(buildInactivityEmail('xx', 'sixMonths', LOGIN_URL, DUE).subject).toBe(de)
  })
})

describe('the retention schedule', () => {
  const config = JSON.parse(readFileSync(resolve('server/utils/maintenanceConfig.json'), 'utf8'))

  test('matches the documented 3y / 6mo / 4w / 24h schedule', () => {
    // These are the periods the privacy policy states, so code and policy have to
    // agree. Guards against someone "tidying" the numbers.
    expect(config.inactivity.retentionDays).toBe(3 * 365)
    expect(config.inactivity.minHoursAfterFinalNotice).toBe(24)
    const byKey = Object.fromEntries(config.inactivity.notices.map((n: never) => [n['key'], n['daysBefore']]))
    expect(byKey.sixMonths).toBe(182)
    expect(byKey.fourWeeks).toBe(28)
    expect(byKey.finalDay).toBe(1)
  })

  test('notice stages line up with the email copy', () => {
    // A stage with no copy would throw at send time, in a cron, at 04:45.
    for (const n of config.inactivity.notices) {
      expect(INACTIVITY_MESSAGES.de[n.key as keyof (typeof INACTIVITY_MESSAGES)['de']]).toBeDefined()
    }
  })

  test('both consumers read the schedule from that one file', () => {
    // The in-app sweep is the production path; the CLI is for local/manual runs.
    // If either inlines the numbers again they will drift.
    expect(readFileSync(resolve('server/utils/inactivitySweep.ts'), 'utf8')).toContain('maintenanceConfig.json')
    expect(readFileSync(resolve('scripts/inactive-accounts.mjs'), 'utf8')).toContain('maintenanceConfig.json')
  })

  test('deletion requires a final notice sent at least 24h earlier', () => {
    // The interlock that stops the first post-deploy run from deleting every
    // long-dormant account with no warning at all. Asserted on BOTH paths.
    for (const f of ['scripts/inactive-accounts.mjs', 'server/utils/inactivitySweep.ts']) {
      const src = readFileSync(resolve(f), 'utf8')
      expect(src, f).toContain('inactivity_notice_24h_at IS NOT NULL')
      expect(src, f).toMatch(/inactivity_notice_24h_at <= \(NOW\(\) - INTERVAL/)
    }
  })

  test('both paths refuse to run when SMTP is not configured', () => {
    // `sendMail()` falls back to a streamTransport that SUCCEEDS while delivering
    // nothing, so a missing SMTP variable in production would stamp the notice column
    // and hard-delete the account 24h later, unwarned. Both paths must stop instead.
    // A dry run stays allowed — it neither mails nor deletes.
    const sweep = readFileSync(resolve('server/utils/inactivitySweep.ts'), 'utf8')
    expect(sweep).toContain('isMailConfigured()')
    expect(sweep).toMatch(/if \(!dryRun && !isMailConfigured\(\)\)/)

    const cli = readFileSync(resolve('scripts/inactive-accounts.mjs'), 'utf8')
    expect(cli).toMatch(/if \(!isDryRun && !\(process\.env\.SMTP_HOST/)

    // And the helper must check all three credentials, not just the host.
    const mailer = readFileSync(resolve('server/utils/mailer.ts'), 'utf8')
    expect(mailer).toMatch(/SMTP_HOST && process\.env\.SMTP_USER && process\.env\.SMTP_PASS/)
  })

  test('the HTTP task endpoint fails closed without a secret', () => {
    // A publicly reachable URL that deletes accounts would be catastrophic, so an
    // unset CRON_SECRET must refuse every request rather than run unauthenticated.
    const src = readFileSync(resolve('server/routes/tasks/[task].ts'), 'utf8')
    expect(src).toContain('CRON_SECRET')
    expect(src).toContain('timingSafeEqual')
    expect(src).toMatch(/if \(!expected \|\| expected\.length < 16\)/)
  })

  test('only a login resets the clock — notices never do', () => {
    // completeLogin clears all three notice columns; nothing else may.
    const login = readFileSync(resolve('server/utils/completeLogin.ts'), 'utf8')
    expect(login).toContain('lastLoginAt')
    expect(login).toContain('inactivityNotice6mAt: null')
    expect(login).toContain('inactivityNotice4wAt: null')
    expect(login).toContain('inactivityNotice24hAt: null')
  })

  test('the ghost account is excluded from both sweeps', () => {
    const script = readFileSync(resolve('scripts/inactive-accounts.mjs'), 'utf8')
    expect(script.match(/is_ghost = 0/g)?.length).toBeGreaterThanOrEqual(2)
  })
})
