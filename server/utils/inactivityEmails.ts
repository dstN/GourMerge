/**
 * Localized inactivity-warning emails.
 *
 * The copy lives in `inactivityMessages.json`, **not** in this file, because two
 * very different consumers need it: this module (inside Nitro) and
 * `scripts/inactive-accounts.mjs` (a plain Node process with no TS pipeline, run
 * from cron). A JSON file both can read is the only way to keep one source of
 * truth — the alternative was the script re-parsing a TypeScript literal, which
 * is exactly the kind of duplication that drifts silently.
 *
 * Three stages, all sent before anything is deleted:
 *   `sixMonths` → 6 months before, `fourWeeks` → 4 weeks before, `finalDay` → 24h.
 *
 * Wording rule: each one must state plainly that **logging in is enough** to keep
 * the account, and must name the exact date. A retention notice that leaves the
 * reader unsure what to do, or by when, is not a real warning.
 *
 * Parity across locales and stages is enforced by
 * `tests/unit/inactivityEmails.test.ts`.
 */
import messages from './inactivityMessages.json'
// Reuse rather than redeclare: everything under `server/utils/` is auto-imported by
// Nitro, so a second `EmailLocale` / `BuiltEmail` export would collide — Nitro picks
// one and silently ignores the other, meaning an unrelated server file could end up
// with the wrong type. knip flags this as a duplicated import.
import type { EmailLocale } from './emailMessages'
import type { BuiltEmail } from './emailI18n'

export type InactivityStage = 'sixMonths' | 'fourWeeks' | 'finalDay'

interface Strings {
  subject: string
  /** `{date}` is replaced with the localized deletion date. */
  intro: string
  linkLabel: string
  /** Closing note; may also use `{date}`. */
  outro: string
}

export const INACTIVITY_MESSAGES = messages as Record<EmailLocale, Record<InactivityStage, Strings>>

const DATE_LOCALE: Record<EmailLocale, string> = {
  de: 'de-DE',
  en: 'en-GB',
  fr: 'fr-FR',
  it: 'it-IT',
}

function resolveLocale(locale?: string | null): EmailLocale {
  return locale === 'en' || locale === 'fr' || locale === 'it' ? locale : 'de'
}

/**
 * Build one inactivity notice.
 *
 * @param deletionDate When the account is due to be deleted. Rendered as a full
 *   date with no time — an exact timestamp would imply a precision the nightly
 *   cron does not have.
 */
export function buildInactivityEmail(
  locale: string | null | undefined,
  stage: InactivityStage,
  loginUrl: string,
  deletionDate: Date
): BuiltEmail {
  const loc = resolveLocale(locale)
  const s = INACTIVITY_MESSAGES[loc][stage]
  const date = new Intl.DateTimeFormat(DATE_LOCALE[loc], {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(deletionDate)

  const intro = s.intro.replaceAll('{date}', date)
  const outro = s.outro.replaceAll('{date}', date)

  return {
    subject: s.subject,
    text: `${intro}\n\n${loginUrl}\n\n${outro}`,
    html: `<p>${intro}</p>\n<p><a href="${loginUrl}">${s.linkLabel}</a></p>\n<p>${outro}</p>`,
  }
}
