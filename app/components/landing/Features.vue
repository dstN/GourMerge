<script setup lang="ts">
/**
 * The four-card feature grid of the landing page. Its own component for one reason: it is
 * rendered with `hydrate-never` from `pages/index.vue`. Nothing in it is interactive — cards,
 * icons, text — so hydrating it only paid for walking its DOM inside the one long task that
 * Lighthouse scores as Total Blocking Time. See the note in `pages/index.vue`.
 */
const { t } = useI18n()

const features = computed(() => [
  {
    icon: 'i-lucide-git-fork',
    title: t('landing.featureFork'),
    description: t('landing.featureForkDesc'),
  },
  {
    icon: 'i-lucide-git-branch',
    title: t('landing.featureBranch'),
    description: t('landing.featureBranchDesc'),
  },
  {
    icon: 'i-lucide-git-commit-horizontal',
    title: t('landing.featureCommit'),
    description: t('landing.featureCommitDesc'),
  },
  {
    icon: 'i-lucide-git-merge',
    title: t('landing.featureMerge'),
    description: t('landing.featureMergeDesc'),
  },
])
</script>

<template>
  <section class="py-20">
    <CommonPageShell width="wide" spacing="none">
      <div class="text-center mb-16">
        <h2 class="text-3xl sm:text-4xl font-bold mb-4">
          {{ t('landing.featuresTitle') }}
        </h2>
        <p class="text-lg text-muted max-w-2xl mx-auto">
          {{ t('landing.featuresSubtitle') }}
        </p>
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <UCard
          v-for="(feature, idx) in features"
          :key="idx"
          class="group hover:border-primary-500/50 transition-colors"
        >
          <div class="flex items-start gap-4">
            <div
              class="shrink-0 size-12 rounded-lg bg-primary-500/10 flex items-center justify-center transition-colors group-hover:bg-primary-500/20"
            >
              <UIcon :name="feature.icon" class="size-6 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h3 class="text-base font-semibold mb-2">{{ feature.title }}</h3>
              <p class="text-muted text-sm leading-relaxed">{{ feature.description }}</p>
            </div>
          </div>
        </UCard>
      </div>
    </CommonPageShell>
  </section>
</template>
