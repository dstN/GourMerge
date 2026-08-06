<script setup lang="ts">
const { t } = useI18n()

useSeoMeta({
  title: () => `${t('help.glossary')} — GourMerge`,
  description: () => t('glossary.seoDescription'),
})

/** Icon per glossary term — a lookup, rather than the eight-deep nested ternary
 *  that used to sit in the template. */
const TERM_ICONS = {
  recipe: 'i-lucide-book-open',
  fork: 'i-lucide-git-fork',
  branch: 'i-lucide-git-branch',
  commit: 'i-lucide-save',
  merge: 'i-lucide-git-merge',
  gourmergeRequest: 'i-lucide-git-pull-request',
  diff: 'i-lucide-diff',
  history: 'i-lucide-history',
} as const

const terms = Object.keys(TERM_ICONS) as Array<keyof typeof TERM_ICONS>
</script>

<template>
  <CommonPageShell width="content">
    <CommonPageHeader :title="t('help.glossary')" :subtitle="t('glossary.subtitle')" icon="i-lucide-book-marked" />

    <div class="space-y-4">
      <UCard v-for="term in terms" :key="term">
        <div class="flex items-start gap-4">
          <UIcon :name="TERM_ICONS[term]" class="size-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <h2 class="text-base font-semibold">
                {{ t(`glossary.${term}.alias`) }}
              </h2>
              <UBadge color="neutral" variant="subtle" :label="t(`glossary.${term}.canonical`)" />
            </div>
            <p class="text-sm text-muted leading-relaxed">
              {{ t(`glossary.${term}.description`) }}
            </p>
            <p class="text-xs text-dimmed mt-1.5 italic">
              {{ t(`glossary.${term}.helpHint`) }}
            </p>
          </div>
        </div>
      </UCard>
    </div>
  </CommonPageShell>
</template>
