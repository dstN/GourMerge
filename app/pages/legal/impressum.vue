<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()

definePageMeta({ layout: 'default' })

useSeoMeta({
  title: `${t('legal.impressumTitle')} — GourMerge`,
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
      </div>
    </UCard>
  </CommonPageShell>
</template>
