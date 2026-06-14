<script setup lang="ts">
/**
 * Landing Page — Public-facing page for non-authenticated users
 *
 * Shows brand hero, feature highlights, and CTA to register.
 * Redirects to /dashboard if already logged in.
 */

const { t } = useI18n()
const { loggedIn } = useUserSession()

// Redirect logged-in users to dashboard
if (loggedIn.value) {
  navigateTo('/dashboard')
}

useSeoMeta({
  title: 'GourMerge — Fork the recipe, merge the flavor.',
  description: 'A Git-inspired recipe management platform. Fork, branch, commit, and merge your culinary creations.',
})

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
  <div>
    <!-- ── Hero Section ──────────────────────────────────── -->
    <section class="relative overflow-hidden py-20 sm:py-32">
      <!-- Background gradient -->
      <div class="absolute inset-0 bg-gradient-to-br from-primary-500/5 via-transparent to-secondary-500/5 pointer-events-none" />

      <div class="relative text-center max-w-4xl mx-auto px-4">
        <div class="inline-flex items-center gap-2 bg-primary-500/10 text-primary-500 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
          <UIcon name="i-lucide-sparkles" class="size-4" />
          {{ t('landing.badge') }}
        </div>

        <h1 class="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6">
          Gour<span class="text-primary-500">Merge</span>
        </h1>

        <p class="text-2xl sm:text-3xl text-[var(--ui-text-muted)] font-light mb-3">
          {{ t('app.slogan') }}
        </p>
        <p class="text-lg text-[var(--ui-text-dimmed)] italic mb-10">
          {{ t('app.sloganDe') }}
        </p>

        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <UButton
            :label="t('landing.getStarted')"
            icon="i-lucide-chef-hat"
            size="xl"
            to="/auth/register"
            class="shadow-lg shadow-primary-500/25"
          />
          <UButton
            :label="t('landing.learnMore')"
            icon="i-lucide-play-circle"
            variant="outline"
            color="neutral"
            size="xl"
          />
        </div>
      </div>
    </section>

    <!-- ── Features Grid ─────────────────────────────────── -->
    <section class="py-20">
      <div class="max-w-6xl mx-auto px-4">
        <div class="text-center mb-16">
          <h2 class="text-3xl sm:text-4xl font-bold mb-4">
            {{ t('landing.featuresTitle') }}
          </h2>
          <p class="text-lg text-[var(--ui-text-muted)] max-w-2xl mx-auto">
            {{ t('landing.featuresSubtitle') }}
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <UCard
            v-for="(feature, idx) in features"
            :key="idx"
            class="group hover:border-primary-500/50 transition-colors"
          >
            <div class="flex items-start gap-4">
              <div class="shrink-0 w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center group-hover:bg-primary-500/20 transition-colors">
                <UIcon :name="feature.icon" class="size-6 text-primary-500" />
              </div>
              <div>
                <h3 class="text-lg font-semibold mb-2">{{ feature.title }}</h3>
                <p class="text-[var(--ui-text-muted)] text-sm leading-relaxed">{{ feature.description }}</p>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </section>

    <!-- ── How It Works ──────────────────────────────────── -->
    <section class="py-20 bg-[var(--ui-bg-elevated)]">
      <div class="max-w-4xl mx-auto px-4">
        <div class="text-center mb-16">
          <h2 class="text-3xl sm:text-4xl font-bold mb-4">
            {{ t('landing.howItWorks') }}
          </h2>
        </div>

        <div class="space-y-8">
          <div
v-for="(step, idx) in [
            { icon: 'i-lucide-plus-circle', title: t('landing.step1Title'), desc: t('landing.step1Desc') },
            { icon: 'i-lucide-pencil', title: t('landing.step2Title'), desc: t('landing.step2Desc') },
            { icon: 'i-lucide-save', title: t('landing.step3Title'), desc: t('landing.step3Desc') },
            { icon: 'i-lucide-share-2', title: t('landing.step4Title'), desc: t('landing.step4Desc') },
          ]" :key="idx" class="flex items-start gap-6">
            <div class="shrink-0 w-10 h-10 rounded-full bg-primary-500 text-white flex items-center justify-center font-bold text-lg">
              {{ idx + 1 }}
            </div>
            <div>
              <h3 class="text-xl font-semibold mb-1">{{ step.title }}</h3>
              <p class="text-[var(--ui-text-muted)]">{{ step.desc }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── CTA Section ───────────────────────────────────── -->
    <section class="py-20">
      <div class="max-w-3xl mx-auto text-center px-4">
        <CommonBrandLogo class="size-16 text-primary-500 mx-auto mb-6" />
        <h2 class="text-3xl sm:text-4xl font-bold mb-4">
          {{ t('landing.ctaTitle') }}
        </h2>
        <p class="text-lg text-[var(--ui-text-muted)] mb-8">
          {{ t('landing.ctaSubtitle') }}
        </p>
        <UButton
          :label="t('landing.getStarted')"
          icon="i-lucide-arrow-right"
          size="xl"
          to="/auth/register"
          class="shadow-lg shadow-primary-500/25"
        />
      </div>
    </section>
  </div>
</template>
