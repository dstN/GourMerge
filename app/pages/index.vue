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
  <!--
    The landing page is the ONE documented exception to the type scale
    (DESIGNBOOK §1.4): it is marketing copy and keeps a display hero. Everything
    else — button sizes, card treatment, colour tokens — follows the system.

    Sections are full-bleed (they carry background tints), so each one wraps its
    content in a `spacing="none"` shell and owns its own vertical rhythm.
  -->
  <div>
    <!-- ── Hero Section ──────────────────────────────────── -->
    <section class="relative overflow-hidden py-20 sm:py-32">
      <!-- Background gradient -->
      <div
        class="absolute inset-0 bg-linear-to-br from-primary-500/5 via-transparent to-secondary-500/5 pointer-events-none"
      />

      <CommonPageShell width="content" spacing="none" class="relative text-center">
        <div
          class="inline-flex items-center gap-2 bg-primary-500/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-6"
        >
          <UIcon name="i-lucide-sparkles" class="size-4" aria-hidden="true" />
          {{ t('landing.badge') }}
        </div>

        <h1 class="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6">
          Gour<span class="text-primary">Merge</span>
        </h1>

        <p class="text-2xl sm:text-3xl text-muted font-light mb-10">
          {{ t('app.slogan') }}
        </p>

        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <UButton :label="t('landing.getStarted')" icon="i-lucide-chef-hat" size="lg" to="/auth/register" />
          <UButton
            :label="t('landing.learnMore')"
            icon="i-lucide-book-marked"
            size="lg"
            color="neutral"
            variant="subtle"
            to="/help/glossary"
          />
        </div>
      </CommonPageShell>
    </section>

    <!-- ── Features Grid ─────────────────────────────────── -->
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

    <!-- ── How It Works ──────────────────────────────────── -->
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

    <!-- ── CTA Section ───────────────────────────────────── -->
    <section class="py-20">
      <CommonPageShell width="content" spacing="none" class="text-center">
        <CommonBrandLogo class="size-16 text-primary mx-auto mb-6" />
        <h2 class="text-3xl sm:text-4xl font-bold mb-4">
          {{ t('landing.ctaTitle') }}
        </h2>
        <p class="text-lg text-muted mb-8">
          {{ t('landing.ctaSubtitle') }}
        </p>
        <UButton :label="t('landing.getStarted')" icon="i-lucide-arrow-right" size="lg" to="/auth/register" />
      </CommonPageShell>
    </section>
  </div>
</template>
