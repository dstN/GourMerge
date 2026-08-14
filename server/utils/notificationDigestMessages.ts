/**
 * Localized copy for the weekly notification digest.
 *
 * A plain object literal, not a JSON file — unlike `inactivityMessages.json`, there is no
 * companion plain-Node script that also needs to read this (the digest only ever runs
 * inside Nitro, dispatched from `/tasks/notification-digest`), so the reason that file is
 * JSON does not apply here.
 */
import type { EmailLocale } from './emailMessages'
import type { NotificationKind } from '~~/shared/types/notification'

interface DigestStrings {
  subject: string
  intro: string
  moreLine: string // '{n}' replaced with the overflow count
  outro: string
  viewAllLabel: string
  kindVerb: Record<NotificationKind, string> // '{actor}' and '{recipe}' replaced
}

export const DIGEST_MESSAGES: Record<EmailLocale, DigestStrings> = {
  de: {
    subject: 'Was du diese Woche auf GourMerge verpasst hast',
    intro: 'Hier ist, was seit deinem letzten Digest passiert ist:',
    moreLine: '… und {n} weitere in deinem Postfach.',
    outro: 'Du erhältst diese Mail einmal wöchentlich, solange ungelesene Benachrichtigungen offen sind.',
    viewAllLabel: 'Alle Benachrichtigungen ansehen',
    kindVerb: {
      recipe_forked: '{actor} hat dein Rezept „{recipe}“ geforkt.',
      gmr_opened: '{actor} hat eine GourMerge Request zu „{recipe}“ eröffnet.',
      discussion_started: '{actor} hat eine Diskussion zu „{recipe}“ gestartet.',
      discussion_reply: '{actor} hat auf deinen Diskussionsbeitrag zu „{recipe}“ geantwortet.',
      gmr_comment: '{actor} hat deine GourMerge Request zu „{recipe}“ kommentiert.',
      mention: '{actor} hat dich in „{recipe}“ erwähnt.',
    },
  },
  en: {
    subject: 'What you missed on GourMerge this week',
    intro: "Here's what happened since your last digest:",
    moreLine: '… and {n} more in your inbox.',
    outro: "You'll get this email once a week while unread notifications are open.",
    viewAllLabel: 'View all notifications',
    kindVerb: {
      recipe_forked: '{actor} forked your recipe "{recipe}".',
      gmr_opened: '{actor} opened a GourMerge Request on "{recipe}".',
      discussion_started: '{actor} started a discussion on "{recipe}".',
      discussion_reply: '{actor} replied to your discussion on "{recipe}".',
      gmr_comment: '{actor} commented on your GourMerge Request on "{recipe}".',
      mention: '{actor} mentioned you in "{recipe}".',
    },
  },
  fr: {
    subject: 'Ce que vous avez manqué sur GourMerge cette semaine',
    intro: "Voici ce qui s'est passé depuis votre dernier résumé :",
    moreLine: '… et {n} de plus dans votre boîte de réception.',
    outro: 'Vous recevrez cet e-mail une fois par semaine tant que des notifications non lues sont ouvertes.',
    viewAllLabel: 'Voir toutes les notifications',
    kindVerb: {
      recipe_forked: '{actor} a forké votre recette « {recipe} ».',
      gmr_opened: '{actor} a ouvert une GourMerge Request sur « {recipe} ».',
      discussion_started: '{actor} a lancé une discussion sur « {recipe} ».',
      discussion_reply: '{actor} a répondu à votre discussion sur « {recipe} ».',
      gmr_comment: '{actor} a commenté votre GourMerge Request sur « {recipe} ».',
      mention: '{actor} vous a mentionné(e) dans « {recipe} ».',
    },
  },
  it: {
    subject: 'Cosa hai perso su GourMerge questa settimana',
    intro: 'Ecco cosa è successo dal tuo ultimo riepilogo:',
    moreLine: '… e altri {n} nella tua casella.',
    outro: 'Riceverai questa email una volta a settimana finché ci sono notifiche non lette.',
    viewAllLabel: 'Vedi tutte le notifiche',
    kindVerb: {
      recipe_forked: '{actor} ha forkato la tua ricetta "{recipe}".',
      gmr_opened: '{actor} ha aperto una GourMerge Request su "{recipe}".',
      discussion_started: '{actor} ha avviato una discussione su "{recipe}".',
      discussion_reply: '{actor} ha risposto alla tua discussione su "{recipe}".',
      gmr_comment: '{actor} ha commentato la tua GourMerge Request su "{recipe}".',
      mention: '{actor} ti ha menzionato in "{recipe}".',
    },
  },
}

function resolveLocale(locale?: string | null): EmailLocale {
  return locale === 'en' || locale === 'fr' || locale === 'it' ? locale : 'de'
}

export function buildNotificationDigestEmail(
  locale: string | null | undefined,
  items: Array<{ kind: NotificationKind; actorName: string; recipeTitle: string }>,
  overflowCount: number,
  viewAllUrl: string
): { subject: string; text: string; html: string } {
  const s = DIGEST_MESSAGES[resolveLocale(locale)]

  const lines = items.map((item) =>
    s.kindVerb[item.kind].replaceAll('{actor}', item.actorName).replaceAll('{recipe}', item.recipeTitle)
  )
  if (overflowCount > 0) lines.push(s.moreLine.replace('{n}', String(overflowCount)))

  const text = [s.intro, '', ...lines, '', viewAllUrl, '', s.outro].join('\n')
  const html = [
    `<p>${s.intro}</p>`,
    `<ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`,
    `<p><a href="${viewAllUrl}">${s.viewAllLabel}</a></p>`,
    `<p>${s.outro}</p>`,
  ].join('\n')

  return { subject: s.subject, text, html }
}
