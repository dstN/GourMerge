<script setup lang="ts">
/**
 * Recipe Commit History Page — GitHub-style URL
 *
 * URL: /:username/:slug/history
 */
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
const { data: recipe } = await useFetch<RecipeDetail>(
  () => `/api/recipes/by-slug/${username.value}/${slug.value}`,
)
if (!recipe.value) {
  throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
}

const recipeId = computed(() => recipe.value!.id)

// ── Branch selection ─────────────────────────────────────────
const selectedBranchId = ref(recipe.value.defaultBranch?.id)

const branchOptions = computed(() =>
  recipe.value?.branches?.map((b) => ({
    label: b.name + (b.isDefault ? ` (${t('recipe.defaultBranch')})` : ''),
    value: b.id,
  })) || [],
)

// ── Fetch commits for selected branch ────────────────────────
const { data: commits, refresh: refreshCommits } = await useFetch<CommitListItem[]>(
  () => `/api/recipes/${recipeId.value}/commits`,
  { query: { branchId: selectedBranchId } },
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
  }
  catch (err) {
    console.error('Failed to load diff:', err)
    diffData.value = null
  }
  finally {
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
</script>

<template>
  <div class="max-w-4xl mx-auto py-8 px-4">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <NuxtLink
          :to="recipeUrl"
          class="text-sm text-[var(--ui-text-muted)] hover:text-primary-500 mb-2 inline-flex items-center gap-1"
        >
          <UIcon name="i-lucide-arrow-left" class="size-4" />
          {{ recipe?.title }}
        </NuxtLink>
        <h1 class="text-2xl font-bold flex items-center gap-2">
          <UIcon name="i-lucide-history" class="size-6 text-primary-500" />
          {{ t('history.title') }}
        </h1>
      </div>

      <!-- Branch selector -->
      <USelect
        v-model="selectedBranchId"
        :items="branchOptions"
        value-key="value"
        icon="i-lucide-git-branch"
        class="w-48"
      />
    </div>

    <!-- Commit Timeline -->
    <div v-if="commits?.length" class="relative">
      <!-- Vertical line -->
      <div class="absolute left-6 top-0 bottom-0 w-px bg-[var(--ui-border)]" />

      <div
        v-for="(commit, index) in commits"
        :key="commit.id"
        class="relative flex items-start gap-4 mb-6"
      >
        <!-- Timeline dot -->
        <div
          :class="[
            'relative z-10 flex items-center justify-center size-12 rounded-full border-2 shrink-0',
            index === 0
              ? 'bg-primary-500/20 border-primary-500'
              : 'bg-[var(--ui-bg-elevated)] border-[var(--ui-border)]',
          ]"
        >
          <UIcon
            :name="index === 0 ? 'i-lucide-git-commit-vertical' : 'i-lucide-dot'"
            :class="['size-5', index === 0 ? 'text-primary-500' : 'text-[var(--ui-text-muted)]']"
          />
        </div>

        <!-- Commit card -->
        <UCard class="flex-1" :ui="{ root: 'overflow-hidden' }">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="font-semibold text-base">{{ commit.message }}</p>
              <div class="flex items-center gap-2 mt-1 text-sm text-[var(--ui-text-muted)]">
                <UIcon name="i-lucide-user" class="size-3.5" />
                <span>{{ commit.author?.displayName || commit.author?.username }}</span>
                <span>·</span>
                <span>{{ formatDate(commit.createdAt) }}</span>
              </div>
            </div>

            <!-- Diff button (not for initial commit) -->
            <UButton
              v-if="commit.parentCommitId && index < (commits?.length || 0) - 1"
              :label="t('history.viewDiff')"
              icon="i-lucide-diff"
              variant="outline"
              size="xs"
              @click="viewDiff(commits![index + 1]!, commit)"
            />
            <UBadge
              v-else-if="!commit.parentCommitId"
              :label="t('history.initialCommit')"
              color="primary"
              variant="subtle"
              size="sm"
            />
          </div>
        </UCard>
      </div>
    </div>

    <!-- Empty state -->
    <UCard v-else class="text-center py-12">
      <UIcon name="i-lucide-history" class="size-12 mx-auto mb-4 text-[var(--ui-text-dimmed)]" />
      <p class="text-lg font-semibold mb-1">{{ t('history.empty') }}</p>
      <p class="text-[var(--ui-text-muted)]">{{ t('history.emptyDesc') }}</p>
    </UCard>

    <!-- Diff Modal -->
    <UModal v-model:open="showDiff" :title="t('diff.title')">
      <template #body>
        <div v-if="diffLoading" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-primary-500" />
        </div>
        <template v-else-if="diffData">
          <div class="mb-4 text-sm text-[var(--ui-text-muted)] flex items-center gap-2">
            <UBadge color="neutral" variant="subtle">{{ diffCommits.from?.message }}</UBadge>
            <UIcon name="i-lucide-arrow-right" class="size-4" />
            <UBadge color="primary" variant="subtle">{{ diffCommits.to?.message }}</UBadge>
          </div>
          <RecipeDiffViewer :diff="diffData" />
        </template>
        <div v-else class="text-center py-8 text-[var(--ui-text-muted)]">
          {{ t('history.diffError') }}
        </div>
      </template>
    </UModal>
  </div>
</template>
