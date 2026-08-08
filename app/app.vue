<script setup lang="ts">
const { locale, locales, t } = useI18n()
const switchLocalePath = useSwitchLocalePath()
const route = useRoute()
const appUrl = useRuntimeConfig().public.appUrl.replace(/\/$/, '')

/**
 * `<html lang>` follows the active locale so screen readers announce the right language
 * (WCAG 3.1.1). Reactive, so it updates on a locale switch rather than only on load.
 *
 * The canonical link comes from i18n's own generator, which gets it right per locale
 * (`/fr` → `https://gourmerge.de/fr`). It needs `i18n.baseUrl` to produce absolute URLs — see
 * the note in nuxt.config.ts.
 */
const localeHead = useLocaleHead({ lang: true, dir: true, seo: true })

/**
 * `hreflang` alternates, built here rather than taken from the module.
 *
 * With `prefix_except_default`, `/` `/en` `/fr` `/it` are four URLs carrying the same content.
 * Without alternates Google has to guess they are translations rather than duplicates; it picks
 * one and drops the rest, so three quarters of the translation work never reaches search
 * results. This is the tag that prevents that, and production had none.
 *
 * Hand-rolled because `useLocaleHead({ seo: true })` emits the canonical and stops — verified on
 * a production build, `grep -c hreflang` = 0 next to a correct canonical. The module puts the
 * alternates behind `experimental.strictSeo`, and that flag 500s every page here even with the
 * `language` tags it demands, so it is not an option. Ten lines under our own control and
 * checked by a test beat a flag that takes the site down.
 *
 * `x-default` points at the default locale: it is what search engines use for a visitor whose
 * language matches none of the four, and omitting it is the most common way an otherwise
 * correct alternate set still underperforms.
 */
const alternateLinks = computed(() => {
  const list = (locales.value as { code: string; language?: string }[]).filter((l) => l.language)
  return [
    ...list.map((l) => ({
      rel: 'alternate' as const,
      hreflang: l.language as string,
      href: `${appUrl}${switchLocalePath(l.code as 'de' | 'en' | 'fr' | 'it')}`,
    })),
    { rel: 'alternate' as const, hreflang: 'x-default', href: `${appUrl}${switchLocalePath('de')}` },
  ]
})

// Two calls rather than one merged object, and not for style: i18n's `link` entries carry their
// own narrow types (a `CanonicalLink` insists on `rel: 'canonical'`), so concatenating them with
// plain alternate objects fails to typecheck. Splitting them keeps both sides honestly typed
// instead of silencing it with a cast — `useHead` merges the results anyway.
useHead(() => ({
  htmlAttrs: { lang: locale.value, ...localeHead.value.htmlAttrs },
  link: localeHead.value.link,
  meta: localeHead.value.meta,
}))

useHead(() => ({ link: alternateLinks.value }))

/**
 * Site-wide social and search defaults, so no page ships without them.
 *
 * `useSeoMeta` here sets the floor; a page calling `useSeoMeta({ title, description })` overrides
 * it, which is how recipe and profile pages already work. Before this, pages that set only a
 * title had no description at all — Google then invents one from the body text, and link
 * previews in chat apps showed a bare URL.
 *
 * All of it is translated, including `og:description`. A German share link showing an English
 * description is the kind of detail that makes a four-locale site feel like one locale with
 * three afterthoughts.
 *
 * `og:image` is the PWA icon, and that is not a contradiction of "no images, text only" — that
 * rule is about recipe photography and uploads. A share card with no image at all is rendered as
 * a grey box by every platform, and this is a logo we already ship.
 *
 * `twitter:card` stays `summary`, not `summary_large_image`: the large variant expects a wide
 * content image, and stretching a square logo into it looks broken.
 */
useSeoMeta({
  titleTemplate: (title) => (title ? `${title}` : 'GourMerge'),
  description: () => t('seo.description'),
  ogSiteName: 'GourMerge',
  ogType: 'website',
  ogTitle: () => `GourMerge: ${t('app.slogan')}`,
  ogDescription: () => t('seo.description'),
  ogUrl: () => `${appUrl}${route.path}`,
  ogLocale: () => locale.value,
  ogImage: () => `${appUrl}/pwa-512x512.png`,
  twitterCard: 'summary',
  twitterTitle: () => `GourMerge: ${t('app.slogan')}`,
  twitterDescription: () => t('seo.description'),
  twitterImage: () => `${appUrl}/pwa-512x512.png`,
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>

    <!-- Onboarding overlays — mounted globally so they work in every layout -->
    <ClientOnly>
      <OnboardingConceptIntro />
      <OnboardingTourOverlay />
    </ClientOnly>
  </UApp>
</template>
