<script setup lang="ts">
import type { RecipeDetail, GourmergeRequestDetail } from '~~/shared/types/recipe'

definePageMeta({ middleware: ['validate-recipe-route'] })

const { t } = useI18n()
const route = useRoute()
const { loggedIn } = useUserSession()
const toast = useAppToast()

const username = computed(() => route.params.username as string)
const slug = computed(() => route.params.slug as string)
const gmrId = computed(() => route.params.gmrId as string)
const recipeUrl = computed(() => `/${username.value}/${slug.value}`)

const { data: recipe } = useFetch<RecipeDetail>(() => `/api/recipes/by-slug/${username.value}/${slug.value}`, {
  headers: useRequestHeaders(['cookie']),
})

const recipeId = computed(() => recipe.value?.id ?? 0)

const {
  data: gmr,
  pending,
  error,
  refresh,
} = useFetch<GourmergeRequestDetail>(() => `/api/recipes/${recipeId.value}/gourmerge-requests/${gmrId.value}`, {
  headers: useRequestHeaders(['cookie']),
  watch: [recipeId],
})

// ── Actions ──────────────────────────────────────────────────────
const mergePending = ref(false)
const closePending = ref(false)
const commentBody = ref('')
const commentPending = ref(false)

// ── Conflict resolution ──────────────────────────────────────────
interface ConflictVersion {
  quantity?: string
  unit?: string
  notes?: string | null
  content?: string
}
interface ConflictItem {
  type: 'ingredient' | 'step'
  ingredientId?: number
  ingredientName?: string
  stepSortOrder?: number
  description: string
  sourceVersion: ConflictVersion | null
  targetVersion: ConflictVersion | null
}

// Conflicts surfaced by a merge attempt + the owner's per-conflict choice.
const conflicts = ref<ConflictItem[]>([])
const choices = ref<Record<string, 'source' | 'target'>>({})

function conflictKey(c: ConflictItem): string {
  return `${c.type}:${c.ingredientId ?? c.stepSortOrder}`
}

function conflictLabel(c: ConflictItem): string {
  return c.type === 'ingredient'
    ? (c.ingredientName ?? `#${c.ingredientId}`)
    : t('diff.stepNumber', { n: c.stepSortOrder })
}

function formatVersion(c: ConflictItem, v: ConflictVersion | null): string {
  if (v === null) return t('gourmergeRequest.conflictDeleted')
  if (c.type === 'ingredient') return [v.quantity, v.unit, v.notes].filter(Boolean).join(' ')
  return v.content ?? ''
}

async function executeMerge(resolutions: unknown[] = []) {
  if (!recipe.value || !gmrId.value) return
  mergePending.value = true
  try {
    const res = await $fetch<{ success: boolean; hasConflicts?: boolean; conflicts?: ConflictItem[] }>(
      `/api/recipes/${recipe.value.id}/gourmerge-requests/${gmrId.value}/merge`,
      { method: 'POST', body: { resolutions } }
    )
    if (res.success) {
      conflicts.value = []
      toast.success(t('gourmergeRequest.mergeSuccess'))
      await refresh()
    } else if (res.hasConflicts && res.conflicts) {
      conflicts.value = res.conflicts
      // Default every conflict to keeping the source (proposed) version.
      const next: Record<string, 'source' | 'target'> = {}
      for (const c of res.conflicts) next[conflictKey(c)] = 'source'
      choices.value = next
      toast.info(t('gourmergeRequest.conflictsTitle'), t('gourmergeRequest.conflictsDesc'))
    }
  } catch (e: unknown) {
    toast.error((e as { data?: { statusMessage?: string } })?.data?.statusMessage || t('gourmergeRequest.mergeError'))
  } finally {
    mergePending.value = false
  }
}

function resolveAndMerge() {
  executeMerge(
    conflicts.value.map((c) => ({
      type: c.type,
      ingredientId: c.ingredientId,
      stepSortOrder: c.stepSortOrder,
      choice: choices.value[conflictKey(c)] ?? 'source',
    }))
  )
}

async function updateStatus(status: 'open' | 'closed') {
  if (!recipe.value) return
  closePending.value = true
  try {
    await $fetch(`/api/recipes/${recipe.value.id}/gourmerge-requests/${gmrId.value}`, {
      method: 'PATCH',
      body: { status },
    })
    await refresh()
  } catch (e: unknown) {
    toast.error((e as { data?: { statusMessage?: string } })?.data?.statusMessage || t('common.error'))
  } finally {
    closePending.value = false
  }
}

async function submitComment() {
  if (!recipe.value || !commentBody.value.trim()) return
  commentPending.value = true
  try {
    await $fetch(`/api/recipes/${recipe.value.id}/gourmerge-requests/${gmrId.value}/comments`, {
      method: 'POST',
      body: { body: commentBody.value },
    })
    commentBody.value = ''
    await refresh()
  } catch (e: unknown) {
    toast.error((e as { data?: { statusMessage?: string } })?.data?.statusMessage || t('common.error'))
  } finally {
    commentPending.value = false
  }
}

const statusColor = computed(
  () =>
    ({
      open: 'success' as const,
      closed: 'neutral' as const,
      merged: 'primary' as const,
      draft: 'warning' as const,
    })[gmr.value?.status ?? 'open']
)

useSeoMeta({
  title: () => (gmr.value ? `${gmr.value.title} — GourMerge` : 'GourMerge'),
})
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8">
    <!-- Breadcrumb -->
    <div class="flex items-center gap-2 text-sm text-[var(--ui-text-muted)] mb-4">
      <NuxtLink :to="recipeUrl" class="hover:text-primary-500 transition-colors">{{ recipe?.title }}</NuxtLink>
      <UIcon name="i-lucide-chevron-right" class="size-4" />
      <NuxtLink :to="`${recipeUrl}/gourmerge-requests`" class="hover:text-primary-500 transition-colors">
        {{ t('gourmergeRequest.titlePlural') }}
      </NuxtLink>
      <UIcon name="i-lucide-chevron-right" class="size-4" />
      <span class="truncate max-w-48">{{ gmr?.title }}</span>
    </div>

    <div v-if="pending" class="space-y-4">
      <USkeleton class="h-12 w-2/3" />
      <USkeleton class="h-48 w-full rounded-xl" />
    </div>

    <div v-else-if="error || !gmr" class="text-center py-16">
      <p class="text-[var(--ui-text-muted)]">{{ t('common.error') }}</p>
    </div>

    <template v-else>
      <!-- Header -->
      <div class="flex items-start justify-between gap-4 mb-6">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <UBadge :color="statusColor" variant="soft" :label="t(`gourmergeRequest.${gmr.status}`)" />
            <h1 class="text-2xl font-bold">{{ gmr.title }}</h1>
          </div>
          <p class="text-sm text-[var(--ui-text-muted)]">
            {{ t('gourmergeRequest.by', { author: gmr.author?.displayName || gmr.author?.username }) }}
          </p>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-2 shrink-0">
          <UButton
            v-if="gmr.canMerge"
            :label="t('gourmergeRequest.mergeButton')"
            icon="i-lucide-git-merge"
            color="success"
            :loading="mergePending"
            data-tour="merge-button"
            @click="executeMerge()"
          />
          <CommonHelpHint v-if="gmr.canMerge" i18n-key="glossary.merge.helpHint" size="sm" />
          <UButton
            v-if="gmr.status === 'open' && loggedIn"
            :label="t('gourmergeRequest.closeButton')"
            icon="i-lucide-x-circle"
            variant="outline"
            color="neutral"
            size="sm"
            :loading="closePending"
            @click="updateStatus('closed')"
          />
          <UButton
            v-if="gmr.status === 'closed' && loggedIn"
            :label="t('gourmergeRequest.reopenButton')"
            icon="i-lucide-refresh-cw"
            variant="outline"
            color="neutral"
            size="sm"
            :loading="closePending"
            @click="updateStatus('open')"
          />
        </div>
      </div>

      <!-- Branch info -->
      <div
        class="flex items-center gap-2 text-sm text-[var(--ui-text-muted)] mb-6 p-3 bg-[var(--ui-bg-elevated)] rounded-lg"
      >
        <UIcon name="i-lucide-git-branch" class="size-4 text-primary-500" />
        <span class="font-mono font-medium">{{ gmr.sourceBranch?.name }}</span>
        <UIcon name="i-lucide-arrow-right" class="size-4" />
        <UIcon name="i-lucide-git-branch" class="size-4 text-success-500" />
        <span class="font-mono font-medium">{{ gmr.targetBranch?.name }}</span>
      </div>

      <!-- Description -->
      <p v-if="gmr.description" class="text-[var(--ui-text-muted)] mb-6">{{ gmr.description }}</p>

      <!-- Conflict resolution (shown only after a merge attempt surfaces conflicts) -->
      <UCard v-if="conflicts.length" class="mb-6 ring-1 ring-warning-500/40">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-alert-triangle" class="size-5 text-warning-500" />
            <h2 class="font-semibold">{{ t('gourmergeRequest.conflictsTitle') }}</h2>
          </div>
        </template>

        <p class="text-sm text-[var(--ui-text-muted)] mb-4">{{ t('gourmergeRequest.conflictsDesc') }}</p>

        <div class="space-y-4">
          <div v-for="c in conflicts" :key="conflictKey(c)" class="border border-[var(--ui-border)] rounded-lg p-3">
            <p class="font-medium text-sm mb-2">{{ conflictLabel(c) }}</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                class="text-left p-3 rounded-lg border transition-colors"
                :class="
                  choices[conflictKey(c)] === 'source'
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-[var(--ui-border)] hover:border-primary-500/50'
                "
                :aria-pressed="choices[conflictKey(c)] === 'source'"
                @click="choices[conflictKey(c)] = 'source'"
              >
                <span class="block text-xs font-medium text-[var(--ui-text-muted)] mb-1">
                  {{ t('gourmergeRequest.conflictSource') }}
                </span>
                <span class="text-sm break-words">{{ formatVersion(c, c.sourceVersion) }}</span>
              </button>
              <button
                type="button"
                class="text-left p-3 rounded-lg border transition-colors"
                :class="
                  choices[conflictKey(c)] === 'target'
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-[var(--ui-border)] hover:border-primary-500/50'
                "
                :aria-pressed="choices[conflictKey(c)] === 'target'"
                @click="choices[conflictKey(c)] = 'target'"
              >
                <span class="block text-xs font-medium text-[var(--ui-text-muted)] mb-1">
                  {{ t('gourmergeRequest.conflictTarget') }}
                </span>
                <span class="text-sm break-words">{{ formatVersion(c, c.targetVersion) }}</span>
              </button>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end">
            <UButton
              :label="t('gourmergeRequest.conflictResolveMerge')"
              icon="i-lucide-git-merge"
              color="success"
              :loading="mergePending"
              @click="resolveAndMerge"
            />
          </div>
        </template>
      </UCard>

      <!-- Diff -->
      <UCard class="mb-6">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-diff" class="size-5 text-primary-500" />
            <h2 class="font-semibold">{{ t('gourmergeRequest.diffTitle') }}</h2>
          </div>
        </template>

        <div
          v-if="!gmr.diff || (gmr.diff.ingredients.length === 0 && gmr.diff.steps.length === 0)"
          class="text-center py-8 text-[var(--ui-text-muted)]"
        >
          {{ t('gourmergeRequest.noDiff') }}
        </div>
        <RecipeDiffViewer v-else :diff="gmr.diff" />
      </UCard>

      <!-- Comments -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-message-square" class="size-5 text-primary-500" />
            <h2 class="font-semibold">{{ t('gourmergeRequest.addComment') }}</h2>
            <UBadge color="neutral" variant="subtle" :label="String(gmr.comments?.length ?? 0)" size="xs" />
          </div>
        </template>

        <!-- Existing comments -->
        <div v-if="gmr.comments?.length" class="space-y-4 mb-6">
          <div v-for="c in gmr.comments" :key="c.id" class="flex gap-3 p-3 rounded-lg bg-[var(--ui-bg-elevated)]">
            <div class="w-8 h-8 rounded-full bg-primary-500/10 flex items-center justify-center shrink-0">
              <UIcon name="i-lucide-user-circle" class="size-5 text-primary-500" />
            </div>
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <span class="font-medium text-sm">{{ c.authorDisplayName || c.authorUsername }}</span>
              </div>
              <p class="text-sm text-[var(--ui-text-muted)]">{{ c.body }}</p>
            </div>
          </div>
        </div>

        <!-- Add comment -->
        <div v-if="loggedIn && gmr.status === 'open'" class="space-y-3">
          <UTextarea
            v-model="commentBody"
            :placeholder="t('gourmergeRequest.commentPlaceholder')"
            :rows="3"
            class="w-full"
          />
          <div class="flex justify-end">
            <UButton
              :label="t('gourmergeRequest.commentSubmit')"
              icon="i-lucide-send"
              size="sm"
              :loading="commentPending"
              :disabled="!commentBody.trim()"
              @click="submitComment"
            />
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>
