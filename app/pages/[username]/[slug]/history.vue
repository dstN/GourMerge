<script setup lang="ts">
import type { RecipeDetail } from '~~/shared/types/recipe'
import type { CommitDiff } from '~~/shared/types'

interface CommitListItem {
  id: number
  message: string
  parentCommitId: number | null
  createdAt: string
  author: { id: number; username: string; displayName: string | null; avatarUrl: string | null }
}

definePageMeta({ layout: 'dashboard', middleware: ['validate-recipe-route', 'auth'] })

const { t } = useI18n()
const route = useRoute()

const username = computed(() => route.params.username as string)
const slug = computed(() => route.params.slug as string)
const recipeUrl = computed(() => `/${username.value}/${slug.value}`)

// ── Fetch recipe data ────────────────────────────────────────
const { data: recipe } = await useFetch<RecipeDetail>(() => `/api/recipes/by-slug/${username.value}/${slug.value}`)

useSeoMeta({
  title: () => (recipe.value ? `${recipe.value.title}: GourMerge` : 'GourMerge'),
})

if (!recipe.value) {
  throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
}

const recipeId = computed(() => recipe.value!.id)

// ── Branch selection ─────────────────────────────────────────
const selectedBranchId = ref(recipe.value.defaultBranch?.id)

const branchOptions = computed(
  () =>
    recipe.value?.branches?.map((b) => ({
      label: b.name + (b.isDefault ? ` (${t('recipe.defaultBranch')})` : ''),
      value: b.id,
    })) || []
)

// ── Fetch commits for selected branch ────────────────────────
const { data: commits, refresh: refreshCommits } = await useFetch<CommitListItem[]>(
  () => `/api/recipes/${recipeId.value}/commits`,
  { query: { branchId: selectedBranchId } }
)

watch(selectedBranchId, () => refreshCommits())

// ── Diff modal ───────────────────────────────────────────────
const showDiff = ref(false)
const diffLoading = ref(false)
const diffData = ref<CommitDiff | null>(null)
const diffCommits = ref<{ from: CommitListItem | null; to: CommitListItem | null }>({ from: null, to: null })

async function viewDiff(fromCommit: CommitListItem, toCommit: CommitListItem) {
  diffCommits.value = { from: fromCommit, to: toCommit }
  diffLoading.value = true
  showDiff.value = true

  try {
    diffData.value = await $fetch(`/api/recipes/${recipeId.value}/diff`, {
      query: { from: fromCommit.id, to: toCommit.id },
    })
  } catch (err) {
    console.error('Failed to load diff:', err)
    diffData.value = null
  } finally {
    diffLoading.value = false
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
// ── Tour Automation ───────────────────────────────────────────
const tour = useProductTour()
const onboarding = useOnboarding()

onMounted(() => {
  if (onboarding.isDone.value && !onboarding.hasCompletedTour('history')) {
    tour.start('history', recipeUrl.value)
  }
})
</script>

<template>
  <CommonPageShell width="content">
    <CommonPageHeader
      :title="t('history.title')"
      icon="i-lucide-history"
      :back-to="recipeUrl"
      :back-label="recipe?.title"
    >
      <template #meta>
        <p class="mt-1 text-sm text-muted">
          <CommonGlossaryTerm term="commit" icon />
        </p>
      </template>
      <template #actions>
        <!-- Explicit width allowed: horizontal cluster, not a form column
             (DESIGNBOOK §3.4) -->
        <USelect
          v-model="selectedBranchId"
          :items="branchOptions"
          value-key="value"
          icon="i-lucide-git-branch"
          class="w-48"
          :aria-label="t('branches.title')"
        />
      </template>
    </CommonPageHeader>

    <!-- Commit Timeline -->
    <div v-if="commits?.length" class="relative" data-tour="history-page">
      <!-- Vertical line -->
      <div class="absolute left-6 top-0 bottom-0 w-px bg-accented" />

      <div v-for="(commit, index) in commits" :key="commit.id" class="relative flex items-start gap-4 mb-6">
        <!-- Timeline dot -->
        <div
          :class="[
            'relative z-10 flex items-center justify-center size-12 rounded-full border-2 shrink-0',
            index === 0 ? 'bg-primary-500/20 border-primary-500' : 'bg-elevated border-default',
          ]"
        >
          <UIcon
            :name="index === 0 ? 'i-lucide-git-commit-vertical' : 'i-lucide-dot'"
            :class="['size-5', index === 0 ? 'text-primary' : 'text-muted']"
          />
        </div>

        <!-- Commit card -->
        <UCard class="flex-1">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <h2 class="text-base font-semibold">{{ commit.message }}</h2>
              <div class="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted">
                <UIcon name="i-lucide-user" class="size-4" aria-hidden="true" />
                <span>{{ commit.author?.displayName || commit.author?.username }}</span>
                <span aria-hidden="true">·</span>
                <span>{{ formatDate(commit.createdAt) }}</span>
              </div>
            </div>

            <!-- Diff button (not for initial commit) -->
            <UButton
              v-if="commit.parentCommitId && index < (commits?.length || 0) - 1"
              :label="t('history.viewDiff')"
              icon="i-lucide-diff"
              size="sm"
              color="neutral"
              variant="outline"
              class="shrink-0"
              @click="viewDiff(commits![index + 1]!, commit)"
            />
            <UBadge
              v-else-if="!commit.parentCommitId"
              :label="t('history.initialCommit')"
              color="primary"
              class="shrink-0"
            />
          </div>
        </UCard>
      </div>
    </div>

    <CommonEmptyState
      v-else
      icon="i-lucide-history"
      :title="t('history.empty')"
      :description="t('history.emptyDesc')"
    />

    <!-- Diff Modal -->
    <UModal v-model:open="showDiff" :title="t('diff.title')">
      <template #body>
        <div v-if="diffLoading" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-primary" aria-hidden="true" />
        </div>
        <template v-else-if="diffData">
          <div class="mb-4 text-sm text-muted flex flex-wrap items-center gap-2">
            <UBadge color="neutral" variant="subtle" :label="diffCommits.from?.message" />
            <UIcon name="i-lucide-arrow-right" class="size-4" aria-hidden="true" />
            <UBadge color="primary" :label="diffCommits.to?.message" />
          </div>
          <RecipeDiffViewer :diff="diffData" />
        </template>
        <div v-else class="text-center py-8 text-muted">
          {{ t('history.diffError') }}
        </div>
      </template>
    </UModal>
  </CommonPageShell>
</template>
