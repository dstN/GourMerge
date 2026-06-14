<script setup lang="ts">
const { t } = useI18n()
const { isDone, completeOnboarding, dismissTour } = useOnboarding()
const { loggedIn } = useUserSession()

// Show the modal for new logged-in users who haven't seen it yet.
const show = ref(false)

onMounted(() => {
  if (loggedIn.value && !isDone.value) {
    // Small delay so the page is fully rendered before the modal appears.
    setTimeout(() => { show.value = true }, 800)
  }
})

async function dismiss() {
  show.value = false
  await dismissTour()
}

async function startTour() {
  show.value = false
  await completeOnboarding()
}
</script>

<template>
  <UModal v-model:open="show" :title="t('onboarding.conceptIntro.title')" :ui="{ content: 'max-w-2xl' }">
    <template #body>
      <div class="space-y-6">
        <!-- Hero -->
        <div class="text-center">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-500/10 mb-4">
            <UIcon name="i-lucide-git-fork" class="size-8 text-primary-500" />
          </div>
          <p class="text-[var(--ui-text-muted)] text-base leading-relaxed">
            {{ t('onboarding.conceptIntro.subtitle') }}
          </p>
        </div>

        <!-- Concept cards -->
        <div class="grid gap-3">
          <div
            v-for="concept in ['recipe', 'fork', 'branch', 'commit', 'merge', 'gourmergeRequest']"
            :key="concept"
            class="flex items-start gap-3 p-3 rounded-xl bg-[var(--ui-bg-elevated)]"
          >
            <div class="shrink-0 mt-0.5">
              <UIcon
                :name="concept === 'recipe' ? 'i-lucide-book-open'
                  : concept === 'fork' ? 'i-lucide-git-fork'
                  : concept === 'branch' ? 'i-lucide-git-branch'
                  : concept === 'commit' ? 'i-lucide-save'
                  : concept === 'merge' ? 'i-lucide-git-merge'
                  : 'i-lucide-git-pull-request'"
                class="size-5 text-primary-500"
              />
            </div>
            <div>
              <div class="flex items-center gap-2 mb-0.5">
                <span class="font-semibold text-sm">{{ t(`onboarding.conceptIntro.${concept}.alias`) }}</span>
                <UBadge color="neutral" variant="subtle" size="xs" :label="t(`onboarding.conceptIntro.${concept}.canonical`)" />
              </div>
              <p class="text-sm text-[var(--ui-text-muted)]">
                {{ t(`onboarding.conceptIntro.${concept}.desc`) }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between w-full gap-3">
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          :label="t('onboarding.skipAll')"
          @click="dismiss"
        />
        <UButton
          :label="t('onboarding.gotIt')"
          color="primary"
          icon="i-lucide-arrow-right"
          trailing
          @click="startTour"
        />
      </div>
    </template>
  </UModal>
</template>
