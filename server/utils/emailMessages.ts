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
  /** GDPR Art. 15 — confirm that the export request came from the account owner. */
  exportConfirm: EmailStrings
  /** GDPR Art. 15 — the download link, also shown in the browser. */
  exportReady: EmailStrings
  /** GDPR Art. 17 — confirm that the erasure request came from the account owner. */
  deletionConfirm: EmailStrings
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
    exportConfirm: {
      subject: 'Bestätige deine Datenauskunft',
      intro:
        'Für dein GourMerge-Konto wurde eine Datenauskunft nach Art. 15 DSGVO angefordert. Bestätige über den folgenden Link, dass die Anfrage von dir stammt:',
      linkLabel: 'Datenauskunft bestätigen',
      expiry:
        'Dieser Link läuft in 2 Stunden ab. Falls du das nicht angefordert hast, ignoriere diese E-Mail — es werden keine Daten herausgegeben.',
      textIntro: 'Bestätige über den Link, dass die Datenauskunft von dir stammt:',
    },
    exportReady: {
      subject: 'Deine GourMerge-Daten stehen bereit',
      intro: 'Deine Datenauskunft ist fertig. Über den folgenden Link kannst du sie herunterladen:',
      linkLabel: 'Daten herunterladen',
      expiry:
        'Dieser Link läuft in 24 Stunden ab und funktioniert nur für dich. Danach kannst du jederzeit eine neue Auskunft anfordern.',
      textIntro: 'Lade deine GourMerge-Daten über diesen Link herunter:',
    },
    deletionConfirm: {
      subject: 'Bestätige die Löschung deines Kontos',
      intro:
        'Für dein GourMerge-Konto wurde eine Löschung nach Art. 17 DSGVO angefordert. Über den folgenden Link bestätigst du die Anfrage und wählst, ob deine Rezepte mitgelöscht werden:',
      linkLabel: 'Löschung bestätigen',
      expiry:
        'Dieser Link läuft in 2 Stunden ab. Solange du ihn nicht bestätigst, passiert nichts. Falls du das nicht angefordert hast, ignoriere diese E-Mail.',
      textIntro: 'Bestätige über den Link die Löschung deines Kontos:',
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
    exportConfirm: {
      subject: 'Confirm your data export',
      intro:
        'A data export under Art. 15 GDPR was requested for your GourMerge account. Confirm via the link below that the request came from you:',
      linkLabel: 'Confirm data export',
      expiry: "This link expires in 2 hours. If you didn't request this, ignore this email — no data will be released.",
      textIntro: 'Confirm via the link that the data export was requested by you:',
    },
    exportReady: {
      subject: 'Your GourMerge data is ready',
      intro: 'Your data export is ready. You can download it via the link below:',
      linkLabel: 'Download my data',
      expiry:
        'This link expires in 24 hours and only works for you. After that you can request a new export at any time.',
      textIntro: 'Download your GourMerge data via this link:',
    },
    deletionConfirm: {
      subject: 'Confirm the deletion of your account',
      intro:
        'Deletion under Art. 17 GDPR was requested for your GourMerge account. The link below confirms the request and lets you choose whether your recipes are deleted along with it:',
      linkLabel: 'Confirm deletion',
      expiry:
        "This link expires in 2 hours. Nothing happens until you confirm it. If you didn't request this, ignore this email.",
      textIntro: 'Confirm the deletion of your account via the link:',
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
    exportConfirm: {
      subject: 'Confirme ta demande de données',
      intro:
        'Une demande d’accès aux données (art. 15 RGPD) a été faite pour ton compte GourMerge. Confirme via le lien ci-dessous que la demande vient bien de toi :',
      linkLabel: 'Confirmer la demande',
      expiry:
        "Ce lien expire dans 2 heures. Si tu n'es pas à l'origine de cette demande, ignore cet e-mail — aucune donnée ne sera transmise.",
      textIntro: 'Confirme via le lien que la demande de données vient bien de toi :',
    },
    exportReady: {
      subject: 'Tes données GourMerge sont prêtes',
      intro: 'Ton export de données est prêt. Tu peux le télécharger via le lien ci-dessous :',
      linkLabel: 'Télécharger mes données',
      expiry:
        'Ce lien expire dans 24 heures et ne fonctionne que pour toi. Ensuite, tu peux demander un nouvel export à tout moment.',
      textIntro: 'Télécharge tes données GourMerge via ce lien :',
    },
    deletionConfirm: {
      subject: 'Confirme la suppression de ton compte',
      intro:
        'Une suppression au titre de l’art. 17 RGPD a été demandée pour ton compte GourMerge. Le lien ci-dessous confirme la demande et te permet de choisir si tes recettes sont supprimées avec :',
      linkLabel: 'Confirmer la suppression',
      expiry:
        "Ce lien expire dans 2 heures. Rien ne se passe tant que tu ne l'as pas confirmé. Si tu n'es pas à l'origine de cette demande, ignore cet e-mail.",
      textIntro: 'Confirme la suppression de ton compte via le lien :',
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
    exportConfirm: {
      subject: 'Conferma la richiesta dei tuoi dati',
      intro:
        'È stata richiesta una copia dei dati ai sensi dell’art. 15 GDPR per il tuo account GourMerge. Conferma tramite il link qui sotto che la richiesta proviene da te:',
      linkLabel: 'Conferma la richiesta',
      expiry:
        'Questo link scade tra 2 ore. Se non hai richiesto tu questa azione, ignora questa e-mail: nessun dato verrà trasmesso.',
      textIntro: 'Conferma tramite il link che la richiesta dei dati proviene da te:',
    },
    exportReady: {
      subject: 'I tuoi dati GourMerge sono pronti',
      intro: 'La copia dei tuoi dati è pronta. Puoi scaricarla tramite il link qui sotto:',
      linkLabel: 'Scarica i miei dati',
      expiry:
        'Questo link scade tra 24 ore e funziona solo per te. In seguito puoi richiedere una nuova copia in qualsiasi momento.',
      textIntro: 'Scarica i tuoi dati GourMerge tramite questo link:',
    },
    deletionConfirm: {
      subject: 'Conferma la cancellazione del tuo account',
      intro:
        'È stata richiesta la cancellazione ai sensi dell’art. 17 GDPR per il tuo account GourMerge. Il link qui sotto conferma la richiesta e ti permette di scegliere se cancellare anche le tue ricette:',
      linkLabel: 'Conferma la cancellazione',
      expiry:
        'Questo link scade tra 2 ore. Finché non lo confermi non succede nulla. Se non hai richiesto tu questa azione, ignora questa e-mail.',
      textIntro: 'Conferma la cancellazione del tuo account tramite il link:',
    },
  },
}
