/**
 * Localize Zod's built-in validation messages.
 *
 * Every form schema is Zod, and `UForm` renders Zod's message under the field.
 * Where a rule carries no explicit `message`, that text comes from Zod's error
 * map — which defaults to **English**. So a German user submitting the empty
 * data-request form saw "Invalid email address" and "Too small: expected string
 * to have >=1 characters". The same held on any rule anywhere that had been
 * written without a message, which is most `.max()` calls in the app.
 *
 * Fixing this per rule would mean remembering a `t()` on every constraint forever.
 * Instead this sets Zod's error map from the active locale, so an unmessaged rule
 * is localized by default and the failure mode is "slightly generic wording",
 * never "wrong language". Explicit `t()` messages still win — see the note below
 * on which to prefer.
 *
 * **Client-only, deliberately.** `z.config()` is process-global. On the server one
 * Node process serves many users concurrently, so setting a global from one
 * request's locale would leak that locale into other requests. Server-side Zod
 * messages therefore stay English, which is correct: endpoints return them in
 * `createError({ data: … })` as a diagnostic payload for the API contract, and
 * pages display their own translated copy instead (`t('…Error')`), never the raw
 * field errors. If a server message ever does need to reach a user, pass a
 * per-parse error map at that call site rather than touching the global here.
 *
 * ## Why the imports are dynamic
 *
 * They used to be static, which put Zod plus all four locale packs into the entry
 * chunk — loaded and executed at boot on EVERY page, including the marketing
 * homepage, which contains no form at all. That is main-thread work during the
 * exact window Lighthouse measures as Total Blocking Time, spent on a global that
 * nothing on the page will read.
 *
 * Deferring costs nothing on the pages that do have forms: those route chunks
 * import Zod themselves, so it arrives with the page either way. This only removes
 * it from the pages that never needed it.
 *
 * One locale at a time, too. `import('zod/locales')` is the barrel of every locale Zod
 * ships — a 210 KB chunk on the wire, of which one visitor ever reads one language.
 * Lighthouse listed it as the single largest piece of unused JavaScript on the
 * homepage. `zod/v4/locales/<code>` is a public subpath export, so each language is
 * its own few-KB chunk and the switcher fetches the next one only when it is picked.
 *
 * ## The trigger, and the race it leaves
 *
 * `z.config()` is read at PARSE time, not at schema construction, so the map only
 * has to be in place before the first submit — and a form cannot be submitted
 * without first being touched. The load therefore starts on the first interaction
 * (`pointerdown`, `keydown`, `focusin`) and on nothing else. There used to be an idle
 * deadline as well ("whichever comes first"), and PageSpeed against production showed
 * what it cost: on the start page, which has no form, Zod arrived as a 68 KiB chunk
 * that nothing ever read, inside the window Lighthouse counts as Total Blocking Time
 * ("idle" is long before Time to Interactive, which wants five quiet seconds). A page
 * that is only read now never loads it.
 *
 * The residual window is a submit fired within the same tick as the very first
 * interaction, faster than a dynamic import resolves. A human cannot do that — typing
 * into a field fires `keydown` and `focusin` long before the submit — but a synthetic
 * click can. The cost if it ever happens is one English validation message, on one
 * submit, and the next parse is localized.
 */
const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'focusin'] as const

type LocaleFactory = () => Parameters<typeof import('zod').z.config>[0]
type LocaleModule = { default: LocaleFactory }

const LOCALE_LOADERS: Record<string, () => Promise<LocaleModule>> = {
  de: () => import('zod/v4/locales/de.js'),
  en: () => import('zod/v4/locales/en.js'),
  fr: () => import('zod/v4/locales/fr.js'),
  it: () => import('zod/v4/locales/it.js'),
}

export default defineNuxtPlugin((nuxtApp) => {
  // `nuxtApp.$i18n`, NOT `useI18n()`: vue-i18n's composable throws
  // "Must be called at the top of a setup function" outside a component setup, and
  // a plugin body is not one. Calling it here crashed every page with a 500 —
  // caught because the data-request page rendered the error template instead of
  // its form.
  const i18n = nuxtApp.$i18n as { locale: Ref<string> }

  let apply: ((value: string) => void) | null = null

  async function load() {
    if (apply) return
    const { z } = await import('zod')
    apply = (value: string) => {
      const loader = LOCALE_LOADERS[value] ?? LOCALE_LOADERS.de!
      // A switch that lands while an earlier locale is still in flight resolves in
      // order of arrival; the watcher below re-applies the current one on every change,
      // so the last pick always wins.
      void loader().then((mod) => z.config(mod.default()))
    }
    apply(i18n.locale.value)
  }

  // Zod resolves messages at parse time from the global config, not at schema
  // construction time, so re-configuring is enough — schemas already built in a
  // page's `<script setup>` pick up the new language without being recreated.
  // Before the first load this is a no-op, and `load()` reads the current locale
  // itself, so a switch that happens while still deferred is not lost.
  watch(i18n.locale, (value) => apply?.(value))

  const once = () => {
    for (const type of INTERACTION_EVENTS) window.removeEventListener(type, once, true)
    void load()
  }
  for (const type of INTERACTION_EVENTS) window.addEventListener(type, once, { capture: true, passive: true })
})
