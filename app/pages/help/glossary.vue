<script setup lang="ts">
const { t } = useI18n()

useSeoMeta({
  title: () => `${t('help.glossary')} — GourMerge`,
  description: () => t('glossary.seoDescription'),
})

const terms = [
  'recipe', 'fork', 'branch', 'commit', 'merge', 'gourmergeRequest',
  'diff', 'history',
] as const
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 py-12">
    <div class="mb-8">
      <h1 class="text-3xl font-bold mb-2">{{ t('help.glossary') }}</h1>
      <p class="text-[var(--ui-text-muted)]">{{ t('glossary.subtitle') }}</p>
    </div>

    <div class="space-y-4">
      <UCard v-for="term in terms" :key="term">
        <div class="flex items-start gap-4">
          <UIcon
            :name="term === 'recipe' ? 'i-lucide-book-open'
              : term === 'fork' ? 'i-lucide-git-fork'
              : term === 'branch' ? 'i-lucide-git-branch'
              : term === 'commit' ? 'i-lucide-save'
              : term === 'merge' ? 'i-lucide-git-merge'
              : term === 'gourmergeRequest' ? 'i-lucide-git-pull-request'
              : term === 'diff' ? 'i-lucide-diff'
              : 'i-lucide-history'"
            class="size-6 text-primary-500 shrink-0 mt-0.5"
          />
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <h2 class="font-semibold text-base">
                {{ t(`glossary.${term}.alias`) }}
              </h2>
              <UBadge color="neutral" variant="subtle" size="xs" :label="t(`glossary.${term}.canonical`)" />
            </div>
            <p class="text-sm text-[var(--ui-text-muted)] leading-relaxed">
              {{ t(`glossary.${term}.description`) }}
            </p>
            <p class="text-xs text-[var(--ui-text-dimmed)] mt-1.5 italic">
              {{ t(`glossary.${term}.helpHint`) }}
            </p>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
