<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()

definePageMeta({ layout: 'default' })

useSeoMeta({
  title: `${t('legal.datenschutzTitle')} — GourMerge`,
})

// Postal addresses are verbatim legal details, identical in every language, so
// they stay literal. Everything else is translated. The email lives in
// <CommonObfuscatedEmail> so it is not scrapeable from the SSR payload.
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 py-12">
    <UCard>
      <template #header>
        <h1 class="text-2xl font-bold">
          {{ t('legal.datenschutzTitle') }}
        </h1>
      </template>

      <div class="space-y-8 text-[var(--ui-text)]">
        <!-- 1. Controller -->
        <section>
          <h2 class="text-lg font-semibold mb-2">{{ t('legal.privacy.controllerTitle') }}</h2>
          <address class="not-italic text-sm text-[var(--ui-text-muted)] space-y-0.5">
            <p class="font-medium text-[var(--ui-text)]">Dustin Tramm</p>
            <p>c/o Impressumservice Dein-Impressum</p>
            <p>Stettiner Str. 41</p>
            <p>35410 Hungen</p>
            <p>Deutschland</p>
          </address>
        </section>

        <!-- 2. What we collect -->
        <section>
          <h2 class="text-lg font-semibold mb-2">{{ t('legal.privacy.dataTitle') }}</h2>
          <ul class="list-disc list-inside text-sm text-[var(--ui-text-muted)] space-y-1">
            <li>
              <strong class="text-[var(--ui-text)]">{{ t('legal.privacy.dataAccount') }}</strong>
              {{ t('legal.privacy.dataAccountDesc') }}
            </li>
            <li>
              <strong class="text-[var(--ui-text)]">{{ t('legal.privacy.dataSession') }}</strong>
              {{ t('legal.privacy.dataSessionDesc') }}
            </li>
            <li>
              <strong class="text-[var(--ui-text)]">{{ t('legal.privacy.dataPrefs') }}</strong>
              {{ t('legal.privacy.dataPrefsDesc') }}
            </li>
            <li>
              <strong class="text-[var(--ui-text)]">{{ t('legal.privacy.dataContact') }}</strong>
              {{ t('legal.privacy.dataContactDesc') }}
            </li>
            <li>
              <strong class="text-[var(--ui-text)]">{{ t('legal.privacy.dataRecipes') }}</strong>
              {{ t('legal.privacy.dataRecipesDesc') }}
            </li>
          </ul>
        </section>

        <!-- 3. Purpose -->
        <section>
          <h2 class="text-lg font-semibold mb-2">{{ t('legal.privacy.purposeTitle') }}</h2>
          <p class="text-sm text-[var(--ui-text-muted)]">{{ t('legal.privacy.purposeBody') }}</p>
        </section>

        <!-- 4. Third parties -->
        <section>
          <h2 class="text-lg font-semibold mb-2">{{ t('legal.privacy.thirdPartiesTitle') }}</h2>
          <p class="text-sm text-[var(--ui-text-muted)]">
            {{ t('legal.privacy.thirdPartiesBody') }}
            <a
              href="https://sentry.io/privacy/"
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary-700 dark:text-primary-400 underline"
              >{{ t('legal.privacy.thirdPartiesSentryLink') }}</a
            >.
          </p>
        </section>

        <!-- 5. Your rights -->
        <section>
          <h2 class="text-lg font-semibold mb-2">{{ t('legal.privacy.rightsTitle') }}</h2>
          <ul class="list-disc list-inside text-sm text-[var(--ui-text-muted)] space-y-1">
            <li>{{ t('legal.privacy.right1') }}</li>
            <li>{{ t('legal.privacy.right2') }}</li>
            <li>{{ t('legal.privacy.right3') }}</li>
            <li>{{ t('legal.privacy.right4') }}</li>
            <li>{{ t('legal.privacy.right5') }}</li>
            <li>{{ t('legal.privacy.right6') }}</li>
            <li>{{ t('legal.privacy.right7') }}</li>
          </ul>
          <p class="text-sm text-[var(--ui-text-muted)] mt-2">{{ t('legal.privacy.rightsHint') }}</p>
        </section>

        <!-- 6. Hosting -->
        <section>
          <h2 class="text-lg font-semibold mb-2">{{ t('legal.privacy.hostingTitle') }}</h2>
          <p class="text-sm text-[var(--ui-text-muted)]">{{ t('legal.privacy.hostingBody') }}</p>
          <address class="not-italic text-sm text-[var(--ui-text-muted)] mt-1 space-y-0.5">
            <p class="font-medium text-[var(--ui-text)]">Netcup GmbH</p>
            <p>Daimlerstraße 25</p>
            <p>76185 Karlsruhe</p>
            <p>Deutschland</p>
          </address>
        </section>

        <!-- 7. Retention (Art. 13(2)(a)) -->
        <section>
          <h2 class="text-lg font-semibold mb-2">{{ t('legal.privacy.retentionTitle') }}</h2>
          <ul class="list-disc list-inside text-sm text-[var(--ui-text-muted)] space-y-1">
            <li>{{ t('legal.privacy.retentionAccount') }}</li>
            <li>{{ t('legal.privacy.retentionContact') }}</li>
            <li>{{ t('legal.privacy.retentionTokens') }}</li>
            <li>{{ t('legal.privacy.retentionLogs') }}</li>
            <li>{{ t('legal.privacy.retentionErrors') }}</li>
          </ul>
        </section>

        <!-- 8. Self-service (Art. 15 / Art. 17) -->
        <section>
          <h2 class="text-lg font-semibold mb-2">{{ t('legal.privacy.selfServiceTitle') }}</h2>
          <p class="text-sm text-[var(--ui-text-muted)] mb-3">{{ t('legal.privacy.selfServiceDesc') }}</p>
          <UButton
            :to="localePath('/legal/data-request')"
            :label="t('legal.privacy.linkFromPolicy')"
            icon="i-lucide-shield-check"
            variant="outline"
            size="sm"
          />
        </section>

        <!-- 9. Contact -->
        <section class="border-t border-[var(--ui-border)] pt-6">
          <h2 class="text-lg font-semibold mb-2">{{ t('legal.privacy.contactTitle') }}</h2>
          <p class="text-sm text-[var(--ui-text-muted)]">
            {{ t('legal.imprint.emailLabel') }}:
            <CommonObfuscatedEmail />
          </p>
          <p class="text-sm text-[var(--ui-text-muted)] mt-1">
            {{ t('legal.imprint.formHint') }}
            <NuxtLink :to="localePath('/legal/contact')" class="text-primary-700 dark:text-primary-400 underline">{{
              t('legal.imprint.formLink')
            }}</NuxtLink
            >.
          </p>
        </section>
      </div>
    </UCard>
  </div>
</template>
