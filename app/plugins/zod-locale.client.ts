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
 * ## The race, and why it is acceptable
 *
 * `z.config()` is read at PARSE time, not at schema construction, so the map only
 * has to be in place before the first submit. The trigger below is "whichever comes
 * first: the browser goes idle, or the user touches the page" — and a form cannot
 * be submitted without at least one interaction. The residual window is a submit
 * fired within the same tick as the very first interaction, faster than a dynamic
 * import resolves. A human cannot do that; a synthetic click can. The cost if it
 * ever happens is one English validation message, on one submit, and the next
 * parse is localized. That is a fair trade for taking Zod off every page's boot
 * path — but it is the reason this is written as a deadline rather than a plain
 * `requestIdleCallback`.
 */
type LocaleFactory = () => Parameters<typeof import('zod').z.config>[0]

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
    const [{ z }, { de, en, fr, it }] = await Promise.all([import('zod'), import('zod/locales')])
    const locales: Record<string, LocaleFactory> = { de, en, fr, it }
    apply = (value: string) => z.config((locales[value] ?? de)())
    apply(i18n.locale.value)
  }

  // Zod resolves messages at parse time from the global config, not at schema
  // construction time, so re-configuring is enough — schemas already built in a
  // page's `<script setup>` pick up the new language without being recreated.
  // Before the first load this is a no-op, and `load()` reads the current locale
  // itself, so a switch that happens while still deferred is not lost.
  watch(i18n.locale, (value) => apply?.(value))

  const once = () => {
    window.removeEventListener('pointerdown', once)
    window.removeEventListener('keydown', once)
    void load()
  }
  window.addEventListener('pointerdown', once, { once: true, passive: true })
  window.addEventListener('keydown', once, { once: true })

  if ('requestIdleCallback' in window) window.requestIdleCallback(once, { timeout: 2000 })
  else setTimeout(once, 1000)
})
