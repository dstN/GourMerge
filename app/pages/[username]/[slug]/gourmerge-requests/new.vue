<script setup lang="ts">
definePageMeta({ middleware: ['validate-recipe-route'], auth: true })

const { t } = useI18n()
const route = useRoute()
const { user } = useUserSession()
const toast = useAppToast()

const username = computed(() => route.params.username as string)
const slug = computed(() => route.params.slug as string)
const recipeUrl = computed(() => `/${username.value}/${slug.value}`)

const { data: recipe } = useFetch(
  () => `/api/recipes/by-slug/${username.value}/${slug.value}`,
  { headers: useRequestHeaders(['cookie']), pick: ['id', 'branches', 'title', 'owner'] },
)

// If the user is looking at another user's recipe, they need their own forked recipe's branches
// For simplicity, show branches from the recipe being viewed + potentially their own fork
const form = reactive({
  title: '',
  description: '',
  sourceBranchId: null as number | null,
  targetBranchId: null as number | null,
  sourceRecipeId: null as number | null,
})

// Fetch the current user's forked version (if any)
const { data: myRecipes } = useFetch('/api/recipes', {
  headers: useRequestHeaders(['cookie']),
  query: { owned: true },
})

const targetBranches = computed(() =>
  (recipe.value?.branches ?? []).filter((b: any) => b.isDefault || true)
)

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
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || t('gourmergeRequest.submitError'))
  } finally {
    submitting.value = false
  }
}

useSeoMeta({ title: () => `${t('gourmergeRequest.new')} — GourMerge` })
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 py-8">
    <!-- Breadcrumb -->
    <div class="flex items-center gap-2 text-sm text-[var(--ui-text-muted)] mb-4">
      <NuxtLink :to="recipeUrl" class="hover:text-primary-500 transition-colors">{{ recipe?.title }}</NuxtLink>
      <UIcon name="i-lucide-chevron-right" class="size-4" />
      <NuxtLink :to="`${recipeUrl}/gourmerge-requests`" class="hover:text-primary-500 transition-colors">
        {{ t('gourmergeRequest.titlePlural') }}
      </NuxtLink>
      <UIcon name="i-lucide-chevron-right" class="size-4" />
      <span>{{ t('gourmergeRequest.new') }}</span>
    </div>

    <UCard>
      <template #header>
        <h1 class="text-xl font-bold">{{ t('gourmergeRequest.createTitle') }}</h1>
        <p class="text-sm text-[var(--ui-text-muted)] mt-1">{{ t('gourmergeRequest.createSubtitle') }}</p>
      </template>

      <div class="space-y-5">
        <UFormField :label="t('gourmergeRequest.requestTitle')" required>
          <UInput
            v-model="form.title"
            :placeholder="t('gourmergeRequest.requestTitlePlaceholder')"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('gourmergeRequest.description')">
          <UTextarea
            v-model="form.description"
            :placeholder="t('gourmergeRequest.descriptionPlaceholder')"
            :rows="4"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('gourmergeRequest.sourceBranch')" required>
          <USelect
            v-model="form.sourceBranchId"
            :options="(recipe?.branches ?? []).map((b: any) => ({ label: b.name, value: b.id }))"
            class="w-full"
            :placeholder="t('gourmergeRequest.sourceBranch')"
          />
        </UFormField>

        <UFormField :label="t('gourmergeRequest.targetBranch')" required>
          <USelect
            v-model="form.targetBranchId"
            :options="targetBranches.map((b: any) => ({ label: b.name, value: b.id }))"
            class="w-full"
            :placeholder="t('gourmergeRequest.targetBranch')"
          />
        </UFormField>
      </div>

      <template #footer>
        <div class="flex justify-between items-center">
          <UButton :label="t('common.cancel')" variant="ghost" :to="`${recipeUrl}/gourmerge-requests`" />
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
  </div>
</template>
