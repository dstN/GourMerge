/**
 * Server-side i18n for transactional emails.
 *
 * Emails are sent outside any Vue/i18n component context, so we resolve the
 * `email` namespace from the locale JSON bundles directly, keyed by the
 * recipient's stored `preferredLocale` (falling back to the DE default).
 *
 * Parity of these keys across all four locales is enforced by `npm run i18n:check`.
 */
import de from '~~/i18n/locales/de.json'
import en from '~~/i18n/locales/en.json'
import fr from '~~/i18n/locales/fr.json'
import it from '~~/i18n/locales/it.json'

type Locale = 'de' | 'en' | 'fr' | 'it'

interface EmailStrings {
  subject: string
  intro: string
  linkLabel: string
  expiry: string
  textIntro: string
}

interface EmailBundle {
  verification: EmailStrings
  passwordReset: EmailStrings
}

const BUNDLES: Record<Locale, EmailBundle> = {
  de: (de as unknown as { email: EmailBundle }).email,
  en: (en as unknown as { email: EmailBundle }).email,
  fr: (fr as unknown as { email: EmailBundle }).email,
  it: (it as unknown as { email: EmailBundle }).email,
}

function resolveLocale(locale?: string | null): Locale {
  return locale === 'en' || locale === 'fr' || locale === 'it' ? locale : 'de'
}

export interface BuiltEmail {
  subject: string
  html: string
  text: string
}

function build(s: EmailStrings, url: string): BuiltEmail {
  return {
    subject: s.subject,
    text: `${s.textIntro}\n\n${url}\n\n${s.expiry}`,
    html: `<p>${s.intro}</p>\n<p><a href="${url}">${s.linkLabel}</a></p>\n<p>${s.expiry}</p>`,
  }
}

/** Build the email-verification message in the recipient's locale. */
export function buildVerificationEmail(locale: string | null | undefined, url: string): BuiltEmail {
  return build(BUNDLES[resolveLocale(locale)].verification, url)
}

/** Build the password-reset message in the recipient's locale. */
export function buildPasswordResetEmail(locale: string | null | undefined, url: string): BuiltEmail {
  return build(BUNDLES[resolveLocale(locale)].passwordReset, url)
}
