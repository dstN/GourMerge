<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()

definePageMeta({ layout: 'default' })

useSeoMeta({
  title: `${t('legal.impressumTitle')}: GourMerge`,
})

// The postal address is a legally required verbatim detail (§ 5 DDG) and reads
// identically in every language, so it stays literal rather than going through
// i18n. Only the surrounding labels are translated. The email lives in
// <CommonObfuscatedEmail> so it is not scrapeable from the SSR payload.
</script>

<template>
  <CommonPageShell width="form">
    <UCard>
      <template #header>
        <h1 class="text-2xl font-bold">
          {{ t('legal.impressumTitle') }}
        </h1>
      </template>

      <div class="prose dark:prose-invert max-w-none space-y-4">
        <p class="text-sm text-muted">{{ t('legal.imprint.notice') }}</p>

        <section>
          <h2 class="text-lg font-semibold mb-2">{{ t('legal.imprint.responsible') }}</h2>
          <address class="not-italic space-y-1 text-default">
            <p class="font-semibold">Dustin Tramm</p>
            <p>c/o Impressumservice Dein-Impressum</p>
            <p>Stettiner Str. 41</p>
            <p>35410 Hungen</p>
            <p>Deutschland</p>
          </address>
        </section>

        <!-- § 5 DDG wants a channel that allows prompt electronic contact, so both
             the email address and the contact form are offered here. -->
        <section class="pt-2 border-t border-default">
          <h2 class="text-lg font-semibold mb-2">{{ t('legal.imprint.contactHeading') }}</h2>
          <p class="text-sm text-muted">
            {{ t('legal.imprint.emailLabel') }}:
            <CommonObfuscatedEmail />
          </p>
          <p class="text-sm text-muted mt-1">
            {{ t('legal.imprint.formHint') }}
            <NuxtLink :to="localePath('/legal/contact')" class="link">{{ t('legal.imprint.formLink') }}</NuxtLink
            >.
          </p>
        </section>

        <!-- Both datasets ask for attribution when their data is published; this is the one
             page every visitor can reach without a session. The citation texts are
             translated, the DOI and the two home pages are literal. -->
        <section class="pt-2 border-t border-default">
          <h2 class="text-lg font-semibold mb-2">{{ t('legal.imprint.dataSourcesHeading') }}</h2>
          <p class="text-sm text-muted">{{ t('legal.imprint.dataSourcesIntro') }}</p>
          <ul class="text-sm text-muted mt-1 space-y-1 list-disc pl-5">
            <li>
              {{ t('legal.imprint.dataSourceBls') }}
              <a
                href="https://doi.org/10.25826/Data20251217-134202-0"
                target="_blank"
                rel="noopener noreferrer"
                class="link"
                >DOI: 10.25826/Data20251217-134202-0</a
              >
              · <a href="https://blsdb.de" target="_blank" rel="noopener noreferrer" class="link">blsdb.de</a>
            </li>
            <li>
              {{ t('legal.imprint.dataSourceSwiss') }}
              <a href="https://naehrwertdaten.ch" target="_blank" rel="noopener noreferrer" class="link"
                >naehrwertdaten.ch</a
              >
            </li>
          </ul>
        </section>
      </div>
    </UCard>
  </CommonPageShell>
</template>
