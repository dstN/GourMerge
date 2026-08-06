<script setup lang="ts">
import type { RecipeDetail } from '~~/shared/types/recipe'

/**
 * `auth: true` was dead metadata — nothing reads `route.meta.auth`, so this page
 * had no client-side guard at all and an anonymous visitor got a form that could
 * only fail server-side. The named `auth` middleware is what actually guards.
 */
definePageMeta({ middleware: ['validate-recipe-route', 'auth'] })

const { t } = useI18n()
const { apiError } = useApiError()
const route = useRoute()
const toast = useAppToast()

const username = computed(() => route.params.username as string)
const slug = computed(() => route.params.slug as string)
const recipeUrl = computed(() => `/${username.value}/${slug.value}`)

const { data: recipe } = useFetch<Pick<RecipeDetail, 'id' | 'branches' | 'title' | 'owner'>>(
  () => `/api/recipes/by-slug/${username.value}/${slug.value}`,
  { headers: useRequestHeaders(['cookie']), pick: ['id', 'branches', 'title', 'owner'] }
)

// If the user is looking at another user's recipe, they need their own forked recipe's branches
// For simplicity, show branches from the recipe being viewed + potentially their own fork
//
// `undefined`, not `null`, for the unset branch ids: USelect's model is
// `T | undefined`, and the previous `null` only type-checked because the item
// mappers below were annotated `(b: any)`, which widened `value` to `any`.
const form = reactive({
  title: '',
  description: '',
  sourceBranchId: undefined as number | undefined,
  targetBranchId: undefined as number | undefined,
  sourceRecipeId: undefined as number | undefined,
})

const targetBranches = computed(() => (recipe.value?.branches ?? []).filter((b) => b.isDefault || true))

const submitting = ref(false)

async function submit() {
  if (!recipe.value || !form.title || !form.sourceBranchId || !form.targetBranchId) return
  submitting.value = true
  try {
    const res = await $fetch<{ id: number }>(`/api/recipes/${recipe.value.id}/gourmerge-requests`, {
      method: 'POST',
      body: {
        title: form.title,
        description: form.description || undefined,
        sourceBranchId: form.sourceBranchId,
        targetBranchId: form.targetBranchId,
        sourceRecipeId: form.sourceRecipeId || undefined,
      },
    })
    toast.success(t('gourmergeRequest.submitSuccess'))
    await navigateTo(`${recipeUrl.value}/gourmerge-requests/${res.id}`)
  } catch (e: unknown) {
    toast.error(apiError(e, 'gourmergeRequest.submitError'))
  } finally {
    submitting.value = false
  }
}

useSeoMeta({ title: () => `${t('gourmergeRequest.new')} — GourMerge` })
</script>

<template>
  <CommonPageShell width="form">
    <CommonPageHeader
      :title="t('gourmergeRequest.createTitle')"
      :subtitle="t('gourmergeRequest.createSubtitle')"
      icon="i-lucide-git-pull-request"
      :back-to="`${recipeUrl}/gourmerge-requests`"
      :back-label="t('gourmergeRequest.titlePlural')"
    />

    <UCard>
      <div class="space-y-5">
        <UFormField :label="t('gourmergeRequest.requestTitle')" required>
          <UInput v-model="form.title" :placeholder="t('gourmergeRequest.requestTitlePlaceholder')" />
        </UFormField>

        <UFormField :label="t('gourmergeRequest.description')">
          <UTextarea v-model="form.description" :placeholder="t('gourmergeRequest.descriptionPlaceholder')" :rows="4" />
        </UFormField>

        <UFormField :label="t('gourmergeRequest.sourceBranch')" required>
          <USelect
            v-model="form.sourceBranchId"
            :items="(recipe?.branches ?? []).map((b) => ({ label: b.name, value: b.id }))"
            value-key="value"
            :placeholder="t('gourmergeRequest.sourceBranch')"
          />
        </UFormField>

        <UFormField :label="t('gourmergeRequest.targetBranch')" required>
          <USelect
            v-model="form.targetBranchId"
            :items="targetBranches.map((b) => ({ label: b.name, value: b.id }))"
            value-key="value"
            :placeholder="t('gourmergeRequest.targetBranch')"
          />
        </UFormField>
      </div>

      <template #footer>
        <div class="flex items-center justify-end gap-2">
          <UButton
            :label="t('common.cancel')"
            color="neutral"
            variant="subtle"
            :to="`${recipeUrl}/gourmerge-requests`"
          />
          <UButton
            :label="t('gourmergeRequest.submit')"
            icon="i-lucide-git-pull-request"
            :loading="submitting"
            :disabled="!form.title || !form.sourceBranchId || !form.targetBranchId"
            @click="submit"
          />
        </div>
      </template>
    </UCard>
  </CommonPageShell>
</template>
