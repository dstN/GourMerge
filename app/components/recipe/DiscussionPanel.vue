<script setup lang="ts">
/**
 * RecipeDiscussionPanel — threads on a recipe, or on one commit of it.
 *
 * ## Why it sits *under* the recipe and not beside it
 *
 * A side rail was the other candidate and it loses on every axis that matters here. The
 * reading column is capped at `max-w-4xl` (DESIGNBOOK §4.2) because that is the measure a
 * recipe reads well at; a second column has to come out of that budget, so both halves get
 * worse. Below `lg` a rail collapses underneath anyway — which means designing the stacked
 * version regardless, and on a phone, which is where a recipe is actually used, the rail
 * *is* the stacked version. And the content is sequential: you read the dish, then you have
 * something to say about it. GitHub puts the conversation under the artefact for the same
 * reason.
 *
 * So: one column, discussion last, after the steps.
 *
 * ## Commit level
 *
 * Same component, same endpoints, `commitId` set — which was the question worth answering
 * before building anything, and the answer is yes, cheaply, because a note about a snapshot
 * has the identical shape to a note about a recipe. It earns its place in this product
 * specifically: "this is the version that worked, the next commit over-salted it" is a
 * remark about one commit and belongs on it, not on the recipe as a whole. The history page
 * opens this panel per commit in a modal.
 */
import type { RecipeDiscussion, DiscussionCategory } from '~~/shared/types/discussion'

const props = withDefaults(
  defineProps<{
    recipeId: number
    /** Null (default) = threads about the recipe. A commit id = threads about that snapshot. */
    commitId?: number | null
    /** Enables the moderation actions. Passed in rather than re-derived, so there is one source. */
    isRecipeOwner?: boolean
  }>(),
  { commitId: null, isRecipeOwner: false }
)

const { t, locale } = useI18n()
const { apiError } = useApiError()
const { loggedIn, user } = useUserSession()
const toast = useAppToast()

const CATEGORIES: DiscussionCategory[] = ['idea', 'question', 'issue', 'praise']

/**
 * Light-mode label colour for the category badge. `variant="subtle"` paints the semantic
 * 500 on a 10% wash of the same hue, which measures ~2:1 on white — DESIGNBOOK §1.6. The
 * two lookups are resolved here rather than in the template so neither can be `undefined`
 * at the index.
 */
function categoryTint(category: DiscussionCategory): string {
  return TINT_CLASS[DISCUSSION_CATEGORY_COLOR[category] ?? 'neutral'] ?? ''
}
const categoryItems = computed(() => CATEGORIES.map((value) => ({ label: t(`discussion.category.${value}`), value })))

/**
 * Deliberately not `await`ed. A top-level await turns this into an async setup component,
 * which suspends the nearest `<Suspense>` boundary — and the history page mounts this
 * inside a modal, so opening that modal would blank the page behind it while the request
 * resolves. `lazy` still fetches during SSR and still ships the result in the payload;
 * it only stops the fetch from blocking.
 */
const {
  data: threads,
  pending,
  refresh,
} = useFetch<RecipeDiscussion[]>(() => `/api/recipes/${props.recipeId}/discussions`, {
  headers: useRequestHeaders(['cookie']),
  query: computed(() => (props.commitId ? { commitId: props.commitId } : {})),
  // Keyed on both, so the commit panel and the recipe panel cannot share a cache entry —
  // they are different lists behind the same URL path.
  key: `discussions:${props.recipeId}:${props.commitId ?? 'recipe'}`,
  lazy: true,
  default: () => [],
})

const openCount = computed(() => (threads.value ?? []).filter((d) => d.status === 'open').length)

// ── Composer ─────────────────────────────────────────────────
const composerOpen = ref(false)
const draft = reactive({ title: '', body: '', category: 'idea' as DiscussionCategory })
const creating = ref(false)

// Mirrors the server's Zod schema, so the button is disabled for exactly the inputs the
// endpoint would 422 on.
const canSubmitDraft = computed(() => draft.title.trim().length >= 3 && draft.body.trim().length > 0)

async function createThread() {
  if (!canSubmitDraft.value) return
  creating.value = true
  try {
    await $fetch(`/api/recipes/${props.recipeId}/discussions`, {
      method: 'POST',
      body: {
        title: draft.title.trim(),
        body: draft.body.trim(),
        category: draft.category,
        ...(props.commitId ? { commitId: props.commitId } : {}),
      },
    })
    draft.title = ''
    draft.body = ''
    draft.category = 'idea'
    composerOpen.value = false
    toast.success(t('discussion.created'))
    await refresh()
  } catch (e: unknown) {
    toast.error(apiError(e, 'discussion.createError'))
  } finally {
    creating.value = false
  }
}

// ── Replies ──────────────────────────────────────────────────
/** One draft per thread id, so two open reply boxes cannot overwrite each other. */
const replyDrafts = reactive<Record<number, string>>({})
const replyPending = ref<number | null>(null)

async function submitReply(discussionId: number) {
  const body = (replyDrafts[discussionId] ?? '').trim()
  if (!body) return
  replyPending.value = discussionId
  try {
    await $fetch(`/api/recipes/${props.recipeId}/discussions/${discussionId}/comments`, {
      method: 'POST',
      body: { body },
    })
    replyDrafts[discussionId] = ''
    await refresh()
  } catch (e: unknown) {
    toast.error(apiError(e, 'discussion.replyError'))
  } finally {
    replyPending.value = null
  }
}

// ── Moderation ───────────────────────────────────────────────
const busyThread = ref<number | null>(null)

/** Author or recipe owner — the same rule the endpoints enforce, restated for the UI only. */
function canModerate(thread: RecipeDiscussion): boolean {
  return props.isRecipeOwner || thread.authorId === user.value?.id
}

async function toggleStatus(thread: RecipeDiscussion) {
  busyThread.value = thread.id
  try {
    await $fetch(`/api/recipes/${props.recipeId}/discussions/${thread.id}`, {
      method: 'PATCH',
      body: { status: thread.status === 'open' ? 'resolved' : 'open' },
    })
    await refresh()
  } catch (e: unknown) {
    toast.error(apiError(e, 'common.error'))
  } finally {
    busyThread.value = null
  }
}

const deleteTarget = ref<RecipeDiscussion | null>(null)

async function confirmDelete() {
  const thread = deleteTarget.value
  if (!thread) return
  busyThread.value = thread.id
  try {
    await $fetch(`/api/recipes/${props.recipeId}/discussions/${thread.id}`, { method: 'DELETE' })
    deleteTarget.value = null
    toast.success(t('discussion.deleted'))
    await refresh()
  } catch (e: unknown) {
    toast.error(apiError(e, 'common.error'))
  } finally {
    busyThread.value = null
  }
}

async function deleteReply(discussionId: number, commentId: number) {
  try {
    await $fetch(`/api/recipes/${props.recipeId}/discussions/${discussionId}/comments/${commentId}`, {
      method: 'DELETE',
    })
    await refresh()
  } catch (e: unknown) {
    toast.error(apiError(e, 'common.error'))
  }
}

// ── Formatting ───────────────────────────────────────────────
/** `Intl`, not a hand-rolled map, so the date follows the language switcher. */
function formatDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}
</script>

<template>
  <UCard :data-discussion-scope="commitId ? 'commit' : 'recipe'">
    <template #header>
      <div class="flex flex-wrap items-center gap-2">
        <UIcon name="i-lucide-messages-square" class="size-5 text-primary" aria-hidden="true" />
        <h2 class="text-lg font-semibold">{{ commitId ? t('discussion.commitTitle') : t('discussion.title') }}</h2>
        <UBadge color="neutral" variant="subtle" :label="String(threads?.length ?? 0)" />
        <UBadge
          v-if="openCount > 0"
          color="success"
          variant="subtle"
          :class="TINT_CLASS.success"
          :label="t('discussion.openCount', { n: openCount })"
        />
        <UButton
          v-if="loggedIn"
          class="ml-auto"
          :label="composerOpen ? t('common.cancel') : t('discussion.new')"
          :icon="composerOpen ? 'i-lucide-x' : 'i-lucide-plus'"
          size="sm"
          :color="composerOpen ? 'neutral' : 'primary'"
          :variant="composerOpen ? 'subtle' : 'soft'"
          @click="
            () => {
              composerOpen = !composerOpen
            }
          "
        />
      </div>
      <p class="mt-1 text-sm text-muted">
        {{ commitId ? t('discussion.commitSubtitle') : t('discussion.subtitle') }}
      </p>
    </template>

    <!-- Composer -->
    <div v-if="composerOpen" class="mb-6 space-y-4 rounded-lg border border-default p-4">
      <UFormField :label="t('discussion.categoryLabel')">
        <USelect v-model="draft.category" :items="categoryItems" value-key="value" />
      </UFormField>
      <UFormField :label="t('discussion.titleLabel')" required>
        <UInput v-model="draft.title" :placeholder="t('discussion.titlePlaceholder')" :maxlength="200" />
      </UFormField>
      <UFormField :label="t('discussion.bodyLabel')" :hint="t('discussion.markdownHint')" required>
        <RecipeMentionAutocomplete
          v-model="draft.body"
          :placeholder="t('discussion.bodyPlaceholder')"
          :rows="4"
          :maxlength="10000"
        />
      </UFormField>
      <div class="flex justify-end">
        <UButton
          :label="t('discussion.submit')"
          icon="i-lucide-send"
          :loading="creating"
          :disabled="!canSubmitDraft"
          @click="createThread"
        />
      </div>
    </div>

    <!-- Loading -->
    <div v-if="pending" class="space-y-3">
      <USkeleton class="h-20 w-full rounded-lg" />
      <USkeleton class="h-20 w-full rounded-lg" />
    </div>

    <!-- Empty -->
    <div v-else-if="!threads || threads.length === 0" class="py-8 text-center">
      <UIcon name="i-lucide-message-circle-dashed" class="mx-auto size-12 text-dimmed" aria-hidden="true" />
      <p class="mt-3 text-base font-semibold">{{ t('discussion.emptyTitle') }}</p>
      <p class="mt-1 text-muted">{{ loggedIn ? t('discussion.emptyDesc') : t('discussion.emptyGuest') }}</p>
      <UButton
        v-if="!loggedIn"
        class="mt-4"
        :label="t('auth.login')"
        icon="i-lucide-log-in"
        color="neutral"
        variant="subtle"
        to="/auth/login"
      />
    </div>

    <!-- Threads -->
    <ul v-else class="space-y-4">
      <li
        v-for="thread in threads"
        :id="`discussion-${thread.id}`"
        :key="thread.id"
        :class="[
          'rounded-lg border p-4 scroll-mt-6',
          thread.status === 'resolved' ? 'border-default bg-elevated' : 'border-default',
        ]"
      >
        <div class="flex items-start gap-3">
          <CommonUserAvatar
            :username="thread.authorUsername"
            :display-name="thread.authorDisplayName"
            :avatar-url="thread.authorAvatarUrl"
            size="sm"
            link
          />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                :color="DISCUSSION_CATEGORY_COLOR[thread.category]"
                variant="subtle"
                :class="categoryTint(thread.category)"
                :icon="DISCUSSION_CATEGORY_ICON[thread.category]"
                :label="t(`discussion.category.${thread.category}`)"
              />
              <UBadge
                v-if="thread.status === 'resolved'"
                color="neutral"
                variant="subtle"
                icon="i-lucide-check"
                :label="t('discussion.resolved')"
              />
              <h3 class="min-w-0 break-words text-base font-semibold">{{ thread.title }}</h3>
            </div>

            <p class="mt-1 text-xs text-dimmed">
              <NuxtLink :to="`/${thread.authorUsername}`" class="transition-colors hover:text-default">
                {{ thread.authorDisplayName || thread.authorUsername }}
              </NuxtLink>
              <span aria-hidden="true"> · </span>
              <time :datetime="thread.createdAt">{{ formatDate(thread.createdAt) }}</time>
            </p>

            <!-- eslint-disable-next-line vue/no-v-html -- sanitized allowlist render, same sink as recipe steps -->
            <div class="prose prose-sm dark:prose-invert mt-3 max-w-none" v-html="renderMarkdownSafe(thread.body)" />

            <!-- Replies -->
            <ul v-if="thread.comments.length" class="mt-4 space-y-3 border-l-2 border-default pl-4">
              <li v-for="reply in thread.comments" :key="reply.id" class="flex items-start gap-3">
                <CommonUserAvatar
                  :username="reply.authorUsername"
                  :display-name="reply.authorDisplayName"
                  :avatar-url="reply.authorAvatarUrl"
                  size="xs"
                  link
                />
                <div class="min-w-0 flex-1">
                  <p class="text-xs text-dimmed">
                    {{ reply.authorDisplayName || reply.authorUsername }}
                    <span aria-hidden="true"> · </span>
                    <time :datetime="reply.createdAt">{{ formatDate(reply.createdAt) }}</time>
                  </p>
                  <!-- eslint-disable-next-line vue/no-v-html -- sanitized allowlist render -->
                  <div class="prose prose-sm dark:prose-invert mt-1" v-html="renderMarkdownSafe(reply.body)" />
                </div>
                <UButton
                  v-if="isRecipeOwner || reply.authorId === user?.id"
                  icon="i-lucide-trash-2"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :aria-label="t('discussion.deleteReply')"
                  @click="deleteReply(thread.id, reply.id)"
                />
                <!-- Reporting is for someone who can't already moderate it directly — the
                     author and the recipe owner have the stronger delete action above instead. -->
                <CommonReportButton
                  v-else-if="loggedIn"
                  v-slot="{ open }"
                  target-kind="discussion_comment"
                  :target-id="reply.id"
                >
                  <UButton
                    icon="i-lucide-flag"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :aria-label="t('report.comment')"
                    :title="t('report.comment')"
                    @click="open"
                  />
                </CommonReportButton>
              </li>
            </ul>

            <!-- Reply box -->
            <div v-if="loggedIn && thread.status === 'open'" class="mt-4 space-y-2">
              <RecipeMentionAutocomplete
                v-model="replyDrafts[thread.id]"
                :placeholder="t('discussion.replyPlaceholder')"
                :rows="2"
                :maxlength="10000"
                :aria-label="t('discussion.replyLabel', { title: thread.title })"
              />
              <div class="flex flex-wrap justify-end gap-2">
                <UButton
                  v-if="canModerate(thread)"
                  :label="thread.status === 'open' ? t('discussion.markResolved') : t('discussion.reopen')"
                  :icon="thread.status === 'open' ? 'i-lucide-check-circle' : 'i-lucide-rotate-ccw'"
                  size="sm"
                  color="neutral"
                  variant="outline"
                  :loading="busyThread === thread.id"
                  @click="toggleStatus(thread)"
                />
                <UButton
                  v-if="canModerate(thread)"
                  :label="t('common.delete')"
                  icon="i-lucide-trash-2"
                  size="sm"
                  color="error"
                  variant="outline"
                  @click="
                    () => {
                      deleteTarget = thread
                    }
                  "
                />
                <UButton
                  :label="t('discussion.reply')"
                  icon="i-lucide-corner-down-right"
                  size="sm"
                  :loading="replyPending === thread.id"
                  :disabled="!(replyDrafts[thread.id] ?? '').trim()"
                  @click="submitReply(thread.id)"
                />
              </div>
            </div>

            <!-- Resolved threads take no more replies (the API refuses them), so the only
                 actions left are the moderation pair. -->
            <div v-else-if="canModerate(thread)" class="mt-4 flex flex-wrap justify-end gap-2">
              <UButton
                :label="t('discussion.reopen')"
                icon="i-lucide-rotate-ccw"
                size="sm"
                color="neutral"
                variant="outline"
                :loading="busyThread === thread.id"
                @click="toggleStatus(thread)"
              />
              <UButton
                :label="t('common.delete')"
                icon="i-lucide-trash-2"
                size="sm"
                color="error"
                variant="outline"
                @click="
                  () => {
                    deleteTarget = thread
                  }
                "
              />
            </div>
          </div>
        </div>
      </li>
    </ul>

    <!-- Deleting a thread takes other people's replies with it, so it asks first.
         UModal, never window.confirm — DESIGNBOOK §6.4. -->
    <UModal
      :open="deleteTarget !== null"
      :title="t('discussion.deleteTitle')"
      @update:open="
        (v) => {
          if (!v) deleteTarget = null
        }
      "
    >
      <template #body>
        <p class="text-muted">{{ t('discussion.deleteConfirm') }}</p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            :label="t('common.cancel')"
            color="neutral"
            variant="ghost"
            @click="
              () => {
                deleteTarget = null
              }
            "
          />
          <UButton :label="t('common.delete')" color="error" :loading="busyThread !== null" @click="confirmDelete" />
        </div>
      </template>
    </UModal>
  </UCard>
</template>
