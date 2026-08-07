/**
 * Server-side i18n for transactional emails.
 *
 * Emails are sent outside any Vue/i18n component context, so the strings live in
 * a plain server-only constant (`emailMessages.ts`) and are selected by the
 * recipient's stored `preferredLocale` (falling back to the DE default).
 */
import { EMAIL_MESSAGES, type EmailLocale, type EmailStrings, type EmailNoticeStrings } from './emailMessages'

function resolveLocale(locale?: string | null): EmailLocale {
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

/** No link, no action — see `EmailNoticeStrings` for why this can't reuse `build()`. */
function buildNotice(s: EmailNoticeStrings): BuiltEmail {
  return { subject: s.subject, text: s.body, html: `<p>${s.body}</p>` }
}

/** Build the email-verification message in the recipient's locale. */
export function buildVerificationEmail(locale: string | null | undefined, url: string): BuiltEmail {
  return build(EMAIL_MESSAGES[resolveLocale(locale)].verification, url)
}

/** Build the password-reset message in the recipient's locale. */
export function buildPasswordResetEmail(locale: string | null | undefined, url: string): BuiltEmail {
  return build(EMAIL_MESSAGES[resolveLocale(locale)].passwordReset, url)
}

/** GDPR Art. 15 — ask the account owner to confirm an export request. */
export function buildExportConfirmEmail(locale: string | null | undefined, url: string): BuiltEmail {
  return build(EMAIL_MESSAGES[resolveLocale(locale)].exportConfirm, url)
}

/** GDPR Art. 15 — deliver the download link (also shown in the browser). */
export function buildExportReadyEmail(locale: string | null | undefined, url: string): BuiltEmail {
  return build(EMAIL_MESSAGES[resolveLocale(locale)].exportReady, url)
}

/** GDPR Art. 17 — ask the account owner to confirm an erasure request. */
export function buildDeletionConfirmEmail(locale: string | null | undefined, url: string): BuiltEmail {
  return build(EMAIL_MESSAGES[resolveLocale(locale)].deletionConfirm, url)
}

/** Sent to the NEW address; confirming it both switches the email and verifies it. */
export function buildEmailChangeConfirmEmail(locale: string | null | undefined, url: string): BuiltEmail {
  return build(EMAIL_MESSAGES[resolveLocale(locale)].emailChangeConfirm, url)
}

/**
 * Sent to the OLD address when a change is requested. `locale` here is the OLD address's
 * preferred locale (it hasn't changed), `newEmail` is interpolated into the body so the
 * owner can see, without needing to trust a link, exactly which address is being requested.
 */
export function buildEmailChangeNoticeEmail(locale: string | null | undefined, newEmail: string): BuiltEmail {
  const s = EMAIL_MESSAGES[resolveLocale(locale)].emailChangeNotice
  return buildNotice({ ...s, body: s.body.replace('{email}', newEmail) })
}
