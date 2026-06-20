<script setup lang="ts">
/**
 * Recipe Branches Page — GitHub-style URL
 *
 * URL: /:username/:slug/branches
 */
import type { RecipeDetail } from '~~/shared/types/recipe'

definePageMeta({ layout: 'dashboard', middleware: ['validate-recipe-route', 'auth'] })

const { t } = useI18n()
const route = useRoute()
const toast = useToast()

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
    toast.add({ title: t('branches.created'), color: 'success', icon: 'i-lucide-check' })
    newBranchName.value = ''
    showCreateModal.value = false
    await refreshBranches()
  } catch (err: unknown) {
    toast.add({
      title: (err as { data?: { statusMessage?: string } })?.data?.statusMessage || t('common.error'),
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
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
    toast.add({ title: t('branches.deleted'), color: 'success', icon: 'i-lucide-check' })
    await refreshBranches()
  } catch (err: unknown) {
    toast.add({
      title: (err as { data?: { statusMessage?: string } })?.data?.statusMessage || t('common.error'),
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
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
          <UIcon name="i-lucide-git-branch" class="size-6 text-primary-500" />
          {{ t('branches.title') }}
        </h1>
      </div>

      <UButton :label="t('branches.create')" icon="i-lucide-plus" @click="showCreateModal = true" />
    </div>

    <!-- Branches list -->
    <div class="space-y-3">
      <UCard v-for="branch in branches" :key="branch.id" :ui="{ root: 'overflow-hidden' }">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <UIcon
              name="i-lucide-git-branch"
              :class="['size-5', branch.isDefault ? 'text-primary-500' : 'text-[var(--ui-text-muted)]']"
            />
            <div>
              <div class="flex items-center gap-2">
                <span class="font-semibold">{{ branch.name }}</span>
                <UBadge
                  v-if="branch.isDefault"
                  :label="t('recipe.defaultBranch')"
                  color="primary"
                  variant="subtle"
                  size="xs"
                />
              </div>
              <p class="text-xs text-[var(--ui-text-muted)] mt-0.5">
                HEAD: {{ branch.headCommitId ? `#${branch.headCommitId}` : '—' }}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <UButton
              :label="t('branches.viewHistory')"
              icon="i-lucide-history"
              variant="outline"
              size="xs"
              :to="`${recipeUrl}/history`"
            />
            <UButton
              :label="t('common.edit')"
              icon="i-lucide-pencil"
              variant="outline"
              size="xs"
              :to="`${recipeUrl}/edit?branch=${branch.id}`"
            />
            <UButton
              v-if="!branch.isDefault"
              icon="i-lucide-trash-2"
              variant="ghost"
              color="error"
              size="xs"
              :loading="deleting === branch.id"
              @click="deleteBranch(branch.id)"
            />
          </div>
        </div>
      </UCard>
    </div>

    <!-- Empty state -->
    <UCard v-if="!branches?.length" class="text-center py-12">
      <p class="text-[var(--ui-text-muted)]">{{ t('branches.empty') }}</p>
    </UCard>

    <!-- Create Branch Modal -->
    <UModal v-model:open="showCreateModal" :title="t('branches.createTitle')">
      <template #body>
        <div class="space-y-4">
          <UFormField :label="t('branches.name')">
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
          <UButton :label="t('common.cancel')" variant="outline" color="neutral" @click="showCreateModal = false" />
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
  </div>
</template>
