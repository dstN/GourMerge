import { z } from 'zod'
import { de, en, fr, it } from 'zod/locales'

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
 */
const LOCALES = { de, en, fr, it } as const

export default defineNuxtPlugin((nuxtApp) => {
  // `nuxtApp.$i18n`, NOT `useI18n()`: vue-i18n's composable throws
  // "Must be called at the top of a setup function" outside a component setup, and
  // a plugin body is not one. Calling it here crashed every page with a 500 —
  // caught because the data-request page rendered the error template instead of
  // its form.
  const i18n = nuxtApp.$i18n as { locale: Ref<string> }

  const apply = (value: string) => {
    const localeFactory = LOCALES[value as keyof typeof LOCALES] ?? de
    z.config(localeFactory())
  }

  // Immediate: the first form on the page may be submitted before any change.
  apply(i18n.locale.value)

  // Zod resolves messages at parse time from the global config, not at schema
  // construction time, so re-configuring is enough — schemas already built in a
  // page's `<script setup>` pick up the new language without being recreated.
  watch(i18n.locale, (value) => apply(value))
})
