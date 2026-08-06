<script setup lang="ts">
/**
 * Recipe Branches Page — GitHub-style URL
 *
 * URL: /:username/:slug/branches
 */
import type { RecipeDetail } from '~~/shared/types/recipe'

definePageMeta({ layout: 'dashboard', middleware: ['validate-recipe-route', 'auth'] })

const { t } = useI18n()
const { apiError } = useApiError()
const route = useRoute()
const toast = useAppToast()

const username = computed(() => route.params.username as string)
const slug = computed(() => route.params.slug as string)
const recipeUrl = computed(() => `/${username.value}/${slug.value}`)

// ── Fetch recipe ─────────────────────────────────────────────
const { data: recipe } = await useFetch<RecipeDetail>(() => `/api/recipes/by-slug/${username.value}/${slug.value}`)

useSeoMeta({
  title: () => (recipe.value ? `${recipe.value.title} — GourMerge` : 'GourMerge'),
  robots: 'noindex',
})
if (!recipe.value) {
  throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
}

const recipeId = computed(() => recipe.value!.id)

// ── Fetch branches ───────────────────────────────────────────
const { data: branches, refresh: refreshBranches } = await useFetch(() => `/api/recipes/${recipeId.value}/branches`)

// ── Create branch ────────────────────────────────────────────
const showCreateModal = ref(false)
const newBranchName = ref('')
const sourceBranchId = ref<number | undefined>(undefined)
const creating = ref(false)

async function createBranch() {
  if (!newBranchName.value.trim()) return
  creating.value = true
  try {
    await $fetch(`/api/recipes/${recipeId.value}/branches`, {
      method: 'POST',
      body: {
        name: newBranchName.value.trim(),
        fromBranchId: sourceBranchId.value,
      },
    })
    toast.success(t('branches.created'))
    newBranchName.value = ''
    showCreateModal.value = false
    await refreshBranches()
  } catch (err: unknown) {
    toast.error(apiError(err, 'common.error'))
  } finally {
    creating.value = false
  }
}

// ── Delete branch ────────────────────────────────────────────
const deleting = ref<number | null>(null)

async function deleteBranch(branchId: number) {
  deleting.value = branchId
  try {
    await $fetch(`/api/recipes/${recipeId.value}/branches/${branchId}`, {
      method: 'DELETE',
    })
    toast.success(t('branches.deleted'))
    await refreshBranches()
  } catch (err: unknown) {
    toast.error(apiError(err, 'common.error'))
  } finally {
    deleting.value = null
  }
}

const branchSourceOptions = computed(
  () =>
    branches.value?.map((b) => ({
      label: b.name,
      value: b.id,
    })) || []
)
</script>

<template>
  <CommonPageShell width="content">
    <CommonPageHeader
      :title="t('branches.title')"
      icon="i-lucide-git-branch"
      :back-to="recipeUrl"
      :back-label="recipe?.title"
    >
      <template #actions>
        <UButton
          :label="t('branches.create')"
          icon="i-lucide-plus"
          size="lg"
          @click="
            () => {
              showCreateModal = true
            }
          "
        />
      </template>
    </CommonPageHeader>

    <!-- Branches list -->
    <div class="space-y-3">
      <UCard v-for="branch in branches" :key="branch.id">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex items-center gap-3 min-w-0">
            <UIcon
              name="i-lucide-git-branch"
              :class="['size-5 shrink-0', branch.isDefault ? 'text-primary' : 'text-muted']"
              aria-hidden="true"
            />
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-semibold truncate">{{ branch.name }}</span>
                <UBadge v-if="branch.isDefault" :label="t('recipe.defaultBranch')" color="primary" />
              </div>
              <p class="text-xs text-muted mt-0.5 font-mono">
                HEAD: {{ branch.headCommitId ? `#${branch.headCommitId}` : '—' }}
              </p>
            </div>
          </div>

          <!-- Row actions — all `sm`, per DESIGNBOOK §2 (same rank, same size) -->
          <div class="flex shrink-0 items-center gap-2">
            <UButton
              :label="t('branches.viewHistory')"
              icon="i-lucide-history"
              size="sm"
              color="neutral"
              variant="outline"
              :to="`${recipeUrl}/history`"
            />
            <UButton
              :label="t('common.edit')"
              icon="i-lucide-pencil"
              size="sm"
              color="neutral"
              variant="outline"
              :to="`${recipeUrl}/edit?branch=${branch.id}`"
            />
            <UButton
              v-if="!branch.isDefault"
              icon="i-lucide-trash-2"
              size="sm"
              color="error"
              variant="outline"
              :aria-label="t('common.delete')"
              :loading="deleting === branch.id"
              @click="deleteBranch(branch.id)"
            />
          </div>
        </div>
      </UCard>
    </div>

    <CommonEmptyState v-if="!branches?.length" icon="i-lucide-git-branch" :title="t('branches.empty')" />

    <!-- Create Branch Modal -->
    <UModal v-model:open="showCreateModal" :title="t('branches.createTitle')">
      <template #body>
        <div class="space-y-4">
          <UFormField :label="t('branches.name')" required>
            <UInput v-model="newBranchName" :placeholder="t('branches.namePlaceholder')" icon="i-lucide-git-branch" />
          </UFormField>

          <UFormField :label="t('branches.from')">
            <USelect
              v-model="sourceBranchId"
              :items="branchSourceOptions"
              value-key="value"
              :placeholder="t('branches.fromDefault')"
              icon="i-lucide-git-fork"
            />
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            :label="t('common.cancel')"
            color="neutral"
            variant="subtle"
            @click="
              () => {
                showCreateModal = false
              }
            "
          />
          <UButton
            :label="t('branches.create')"
            icon="i-lucide-plus"
            :loading="creating"
            :disabled="!newBranchName.trim()"
            @click="createBranch"
          />
        </div>
      </template>
    </UModal>
  </CommonPageShell>
</template>
