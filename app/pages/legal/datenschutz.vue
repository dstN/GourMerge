<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ layout: 'default' })

useSeoMeta({
  title: `${t('legal.datenschutzTitle')} — GourMerge`,
})
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
        <!-- 1. Verantwortlicher -->
        <section>
          <h2 class="text-lg font-semibold mb-2">1. Verantwortlicher</h2>
          <address class="not-italic text-sm text-[var(--ui-text-muted)] space-y-0.5">
            <p class="font-medium text-[var(--ui-text)]">Dustin Tramm</p>
            <p>c/o Impressumservice Dein-Impressum</p>
            <p>Stettiner Str. 41</p>
            <p>35410 Hungen</p>
            <p>Deutschland</p>
          </address>
        </section>

        <!-- 2. Welche Daten wir erheben -->
        <section>
          <h2 class="text-lg font-semibold mb-2">2. Welche Daten wir erheben</h2>
          <ul class="list-disc list-inside text-sm text-[var(--ui-text-muted)] space-y-1">
            <li>
              <strong class="text-[var(--ui-text)]">Konto-Daten:</strong> E-Mail-Adresse, Benutzername, Anzeigename
            </li>
            <li>
              <strong class="text-[var(--ui-text)]">Session-Cookie:</strong> HttpOnly, Laufzeit 14 Tage, wird beim
              Anmelden gesetzt
            </li>
            <li>
              <strong class="text-[var(--ui-text)]">Kontaktformular:</strong> Name, E-Mail-Adresse und Nachrichteninhalt
            </li>
          </ul>
        </section>

        <!-- 3. Zweck der Verarbeitung -->
        <section>
          <h2 class="text-lg font-semibold mb-2">3. Zweck der Verarbeitung</h2>
          <p class="text-sm text-[var(--ui-text-muted)]">
            Die erhobenen Daten werden ausschließlich für den Betrieb der Plattform GourMerge sowie für die
            Kommunikation mit Nutzerinnen und Nutzern verwendet. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO
            (Vertragserfüllung) und Art. 6 Abs. 1 lit. f DSGVO (berechtigte Interessen).
          </p>
        </section>

        <!-- 4. Keine Weitergabe an Dritte -->
        <section>
          <h2 class="text-lg font-semibold mb-2">4. Weitergabe an Dritte</h2>
          <p class="text-sm text-[var(--ui-text-muted)]">
            Daten werden grundsätzlich nicht an Dritte weitergegeben. Ausnahme: Wir nutzen
            <strong class="text-[var(--ui-text)]">Sentry</strong> für die Fehlerüberwachung. Dabei können im Fehlerfall
            technische Daten (z.&nbsp;B. Stack-Traces) an Sentry Inc. übermittelt werden. Datenschutzerklärung von
            Sentry:
            <a
              href="https://sentry.io/privacy/"
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary-500 underline"
              >sentry.io/privacy</a
            >.
          </p>
        </section>

        <!-- 5. Ihre Rechte -->
        <section>
          <h2 class="text-lg font-semibold mb-2">5. Ihre Rechte (DSGVO Art.&nbsp;15–22)</h2>
          <ul class="list-disc list-inside text-sm text-[var(--ui-text-muted)] space-y-1">
            <li>Auskunft über gespeicherte Daten (Art.&nbsp;15)</li>
            <li>Berichtigung unrichtiger Daten (Art.&nbsp;16)</li>
            <li>Löschung Ihrer Daten (Art.&nbsp;17)</li>
            <li>Einschränkung der Verarbeitung (Art.&nbsp;18)</li>
            <li>Widerspruch gegen die Verarbeitung (Art.&nbsp;21)</li>
            <li>Datenportabilität (Art.&nbsp;20)</li>
          </ul>
          <p class="text-sm text-[var(--ui-text-muted)] mt-2">
            Zur Ausübung Ihrer Rechte wenden Sie sich bitte über das Kontaktformular oder per E-Mail an uns (siehe
            unten).
          </p>
        </section>

        <!-- 6. Hosting -->
        <section>
          <h2 class="text-lg font-semibold mb-2">6. Hosting</h2>
          <p class="text-sm text-[var(--ui-text-muted)]">Diese Website wird gehostet bei:</p>
          <address class="not-italic text-sm text-[var(--ui-text-muted)] mt-1 space-y-0.5">
            <p class="font-medium text-[var(--ui-text)]">Netcup GmbH</p>
            <p>Daimlerstraße 25</p>
            <p>76185 Karlsruhe</p>
            <p>Deutschland</p>
          </address>
        </section>

        <!-- 7. Kontakt für Datenschutzanfragen -->
        <section class="border-t border-[var(--ui-border)] pt-6">
          <h2 class="text-lg font-semibold mb-2">7. Kontakt für Datenschutzanfragen</h2>
          <p class="text-sm text-[var(--ui-text-muted)]">
            E-Mail: <span class="italic">[PLACEHOLDER — wird noch ergänzt]</span>
          </p>
        </section>
      </div>
    </UCard>
  </div>
</template>
