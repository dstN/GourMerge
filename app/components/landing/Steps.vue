<script setup lang="ts">
/**
 * "How it works": four numbered steps of plain text. Rendered with `hydrate-never` from
 * `pages/index.vue` — there is nothing here for JavaScript to do after the server has
 * rendered it. See the note there.
 */
const { t } = useI18n()

/** Hoisted out of the template: a `v-for` over an inline array literal rebuilt
 *  the whole list on every render and made the markup unreadable. */
const steps = computed(() => [
  { title: t('landing.step1Title'), desc: t('landing.step1Desc') },
  { title: t('landing.step2Title'), desc: t('landing.step2Desc') },
  { title: t('landing.step3Title'), desc: t('landing.step3Desc') },
  { title: t('landing.step4Title'), desc: t('landing.step4Desc') },
])
</script>

<template>
  <section class="py-20 bg-elevated">
    <CommonPageShell width="content" spacing="none">
      <div class="text-center mb-16">
        <h2 class="text-3xl sm:text-4xl font-bold mb-4">
          {{ t('landing.howItWorks') }}
        </h2>
      </div>

      <div class="space-y-8">
        <div v-for="(step, idx) in steps" :key="idx" class="flex items-start gap-6">
          <div
            class="shrink-0 size-10 rounded-full bg-primary text-inverted flex items-center justify-center font-bold text-lg"
          >
            {{ idx + 1 }}
          </div>
          <div>
            <h3 class="text-base font-semibold mb-1">{{ step.title }}</h3>
            <p class="text-muted">{{ step.desc }}</p>
          </div>
        </div>
      </div>
    </CommonPageShell>
  </section>
</template>
