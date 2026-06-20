/**
 * Localized transactional-email strings (server-only).
 *
 * These deliberately live here rather than in `i18n/locales/*.json` because:
 *   1. They are never used client-side — keeping them out of the i18n bundle
 *      avoids shipping them to the browser.
 *   2. `@nuxtjs/i18n` compiles the locale JSON, so importing those files in a
 *      server util yields a wrapped shape, not raw strings.
 *
 * Parity across all four locales (same keys, no empty values) is enforced by
 * `tests/unit/emailI18n.test.ts`.
 */

export type EmailLocale = 'de' | 'en' | 'fr' | 'it'

export interface EmailStrings {
  subject: string
  intro: string
  linkLabel: string
  expiry: string
  textIntro: string
}

export interface EmailBundle {
  verification: EmailStrings
  passwordReset: EmailStrings
}

export const EMAIL_MESSAGES: Record<EmailLocale, EmailBundle> = {
  de: {
    verification: {
      subject: 'Bestätige deine GourMerge-E-Mail-Adresse',
      intro: 'Klicke auf den folgenden Link, um dein GourMerge-Konto zu bestätigen:',
      linkLabel: 'E-Mail bestätigen',
      expiry:
        'Dieser Link läuft in 24 Stunden ab. Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren.',
      textIntro: 'Klicke auf den Link, um deine GourMerge-E-Mail-Adresse zu bestätigen:',
    },
    passwordReset: {
      subject: 'Setze dein GourMerge-Passwort zurück',
      intro: 'Für dein GourMerge-Konto wurde ein Zurücksetzen des Passworts angefordert.',
      linkLabel: 'Passwort zurücksetzen',
      expiry:
        'Dieser Link läuft in 2 Stunden ab. Falls du das nicht angefordert hast, ignoriere diese E-Mail — dein Passwort bleibt unverändert.',
      textIntro: 'Klicke auf den Link, um dein GourMerge-Passwort zurückzusetzen:',
    },
  },
  en: {
    verification: {
      subject: 'Verify your GourMerge email address',
      intro: 'Click the link below to verify your GourMerge account:',
      linkLabel: 'Verify my email',
      expiry: "This link expires in 24 hours. If you didn't request this, you can safely ignore this email.",
      textIntro: 'Click the link to verify your GourMerge email address:',
    },
    passwordReset: {
      subject: 'Reset your GourMerge password',
      intro: 'Someone requested a password reset for your GourMerge account.',
      linkLabel: 'Reset your password',
      expiry:
        "This link expires in 2 hours. If you didn't request this, ignore this email — your password won't change.",
      textIntro: 'Click the link to reset your GourMerge password:',
    },
  },
  fr: {
    verification: {
      subject: 'Confirme ton adresse e-mail GourMerge',
      intro: 'Clique sur le lien ci-dessous pour confirmer ton compte GourMerge :',
      linkLabel: 'Confirmer mon e-mail',
      expiry: "Ce lien expire dans 24 heures. Si tu n'es pas à l'origine de cette demande, tu peux ignorer cet e-mail.",
      textIntro: 'Clique sur le lien pour confirmer ton adresse e-mail GourMerge :',
    },
    passwordReset: {
      subject: 'Réinitialise ton mot de passe GourMerge',
      intro: 'Une réinitialisation du mot de passe a été demandée pour ton compte GourMerge.',
      linkLabel: 'Réinitialiser le mot de passe',
      expiry:
        "Ce lien expire dans 2 heures. Si tu n'es pas à l'origine de cette demande, ignore cet e-mail — ton mot de passe ne changera pas.",
      textIntro: 'Clique sur le lien pour réinitialiser ton mot de passe GourMerge :',
    },
  },
  it: {
    verification: {
      subject: 'Conferma il tuo indirizzo e-mail GourMerge',
      intro: 'Fai clic sul link qui sotto per confermare il tuo account GourMerge:',
      linkLabel: 'Conferma la mia e-mail',
      expiry: 'Questo link scade tra 24 ore. Se non hai richiesto tu questa azione, puoi ignorare questa e-mail.',
      textIntro: 'Fai clic sul link per confermare il tuo indirizzo e-mail GourMerge:',
    },
    passwordReset: {
      subject: 'Reimposta la tua password GourMerge',
      intro: 'È stata richiesta la reimpostazione della password per il tuo account GourMerge.',
      linkLabel: 'Reimposta la password',
      expiry:
        'Questo link scade tra 2 ore. Se non hai richiesto tu questa azione, ignora questa e-mail: la tua password non verrà modificata.',
      textIntro: 'Fai clic sul link per reimpostare la tua password GourMerge:',
    },
  },
}
