<script setup lang="ts">
import type { RecipeDetail, GourmergeRequestDetail } from '~~/shared/types/recipe'

definePageMeta({ middleware: ['validate-recipe-route'] })

const { t } = useI18n()
const { apiError } = useApiError()
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
    toast.error(apiError(e, 'gourmergeRequest.mergeError'))
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
    toast.error(apiError(e, 'common.error'))
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
    toast.error(apiError(e, 'common.error'))
  } finally {
    commentPending.value = false
  }
}

/** Shared map (app/utils/ui.ts) — this used to be a second, local copy of the
 *  same object, which is how the list page and this page drift apart. */
const statusColor = computed(() => GMR_STATUS_COLOR[gmr.value?.status ?? 'open'] ?? 'neutral')

useSeoMeta({
  title: () => (gmr.value ? `${gmr.value.title} — GourMerge` : 'GourMerge'),
})
</script>

<template>
  <CommonPageShell width="content">
    <div v-if="pending" class="space-y-4">
      <USkeleton class="h-12 w-2/3" />
      <USkeleton class="h-48 w-full rounded-lg" />
    </div>

    <CommonEmptyState
      v-else-if="error || !gmr"
      tone="error"
      icon="i-lucide-alert-triangle"
      :title="t('common.error')"
    />

    <template v-else>
      <CommonPageHeader
        :title="gmr.title"
        :back-to="`${recipeUrl}/gourmerge-requests`"
        :back-label="t('gourmergeRequest.titlePlural')"
      >
        <template #meta>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <UBadge :color="statusColor" :label="t(`gourmergeRequest.${gmr.status}`)" />
            <p class="text-sm text-muted">
              {{ t('gourmergeRequest.by', { author: gmr.author?.displayName || gmr.author?.username }) }}
            </p>
          </div>
        </template>

        <template #actions>
          <UButton
            v-if="gmr.canMerge"
            :label="t('gourmergeRequest.mergeButton')"
            icon="i-lucide-git-merge"
            color="success"
            size="lg"
            :loading="mergePending"
            data-tour="merge-button"
            @click="executeMerge()"
          />
          <!-- `lg` to match Merge and Close either side of it. DESIGNBOOK §2.3: one height
               per cluster — at `sm` this rendered 28px against their 36px and read as
               misaligned rather than as a quieter affordance. -->
          <CommonHelpHint v-if="gmr.canMerge" i18n-key="glossary.merge.helpHint" size="lg" />
          <UButton
            v-if="gmr.status === 'open' && loggedIn"
            :label="t('gourmergeRequest.closeButton')"
            icon="i-lucide-x-circle"
            size="lg"
            color="neutral"
            variant="subtle"
            :loading="closePending"
            @click="updateStatus('closed')"
          />
          <UButton
            v-if="gmr.status === 'closed' && loggedIn"
            :label="t('gourmergeRequest.reopenButton')"
            icon="i-lucide-refresh-cw"
            size="lg"
            color="neutral"
            variant="subtle"
            :loading="closePending"
            @click="updateStatus('open')"
          />
        </template>
      </CommonPageHeader>

      <!-- Branch info -->
      <div class="flex flex-wrap items-center gap-2 text-sm text-muted mb-6 p-3 bg-elevated rounded-lg">
        <UIcon name="i-lucide-git-branch" class="size-4 text-primary" aria-hidden="true" />
        <span class="font-mono font-medium">{{ gmr.sourceBranch?.name }}</span>
        <UIcon name="i-lucide-arrow-right" class="size-4" aria-hidden="true" />
        <UIcon name="i-lucide-git-branch" class="size-4 text-success-500" aria-hidden="true" />
        <span class="font-mono font-medium">{{ gmr.targetBranch?.name }}</span>
      </div>

      <!-- Description -->
      <p v-if="gmr.description" class="text-muted mb-6">{{ gmr.description }}</p>

      <!-- Conflict resolution (shown only after a merge attempt surfaces conflicts) -->
      <UCard v-if="conflicts.length" class="mb-6 ring-1 ring-warning-500/40">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-alert-triangle" class="size-5 text-warning-500" aria-hidden="true" />
            <h2 class="text-lg font-semibold">{{ t('gourmergeRequest.conflictsTitle') }}</h2>
          </div>
        </template>

        <p class="text-sm text-muted mb-4">{{ t('gourmergeRequest.conflictsDesc') }}</p>

        <div class="space-y-4">
          <div v-for="c in conflicts" :key="conflictKey(c)" class="border border-default rounded-lg p-3">
            <p class="font-medium text-sm mb-2">{{ conflictLabel(c) }}</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                class="text-left p-3 rounded-lg border transition-colors"
                :class="
                  choices[conflictKey(c)] === 'source'
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-default hover:border-primary-500/50'
                "
                :aria-pressed="choices[conflictKey(c)] === 'source'"
                @click="choices[conflictKey(c)] = 'source'"
              >
                <span class="block text-xs font-medium text-muted mb-1">
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
                    : 'border-default hover:border-primary-500/50'
                "
                :aria-pressed="choices[conflictKey(c)] === 'target'"
                @click="choices[conflictKey(c)] = 'target'"
              >
                <span class="block text-xs font-medium text-muted mb-1">
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
            <UIcon name="i-lucide-diff" class="size-5 text-primary" aria-hidden="true" />
            <h2 class="text-lg font-semibold">{{ t('gourmergeRequest.diffTitle') }}</h2>
          </div>
        </template>

        <div
          v-if="!gmr.diff || (gmr.diff.ingredients.length === 0 && gmr.diff.steps.length === 0)"
          class="text-center py-8 text-muted"
        >
          {{ t('gourmergeRequest.noDiff') }}
        </div>
        <RecipeDiffViewer v-else :diff="gmr.diff" />
      </UCard>

      <!-- Comments -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-message-square" class="size-5 text-primary" aria-hidden="true" />
            <h2 class="text-lg font-semibold">{{ t('gourmergeRequest.addComment') }}</h2>
            <UBadge color="neutral" variant="subtle" :label="String(gmr.comments?.length ?? 0)" />
          </div>
        </template>

        <!-- Existing comments -->
        <div v-if="gmr.comments?.length" class="space-y-4 mb-6">
          <div v-for="c in gmr.comments" :key="c.id" class="flex gap-3 p-3 rounded-lg bg-elevated">
            <div class="size-8 rounded-full bg-primary-500/10 flex items-center justify-center shrink-0">
              <UIcon name="i-lucide-user-circle" class="size-5 text-primary" aria-hidden="true" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-sm mb-1">{{ c.authorDisplayName || c.authorUsername }}</p>
              <p class="text-sm text-muted">{{ c.body }}</p>
            </div>
          </div>
        </div>

        <!-- Add comment -->
        <div v-if="loggedIn && gmr.status === 'open'" class="space-y-3">
          <UFormField :label="t('gourmergeRequest.addComment')">
            <UTextarea v-model="commentBody" :placeholder="t('gourmergeRequest.commentPlaceholder')" :rows="3" />
          </UFormField>
          <div class="flex justify-end">
            <UButton
              :label="t('gourmergeRequest.commentSubmit')"
              icon="i-lucide-send"
              :loading="commentPending"
              :disabled="!commentBody.trim()"
              @click="submitComment"
            />
          </div>
        </div>
      </UCard>
    </template>
  </CommonPageShell>
</template>
