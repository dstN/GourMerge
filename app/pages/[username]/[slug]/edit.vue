<script setup lang="ts">
/**
 * Recipe Editor Page — GitHub-style URL
 *
 * URL: /:username/:slug/edit
 * Resolves recipe via slug, then uses recipe.id for internal APIs.
 */
definePageMeta({ layout: 'dashboard', middleware: ['validate-recipe-route', 'auth'] })

const { t } = useI18n()
const route = useRoute()
const toast = useToast()

const username = computed(() => route.params.username as string)
const slug = computed(() => route.params.slug as string)
const recipeUrl = computed(() => `/${username.value}/${slug.value}`)

const { data: recipe, pending, refresh } = useFetch(
  () => `/api/recipes/by-slug/${username.value}/${slug.value}`,
  { headers: useRequestHeaders(['cookie']) },
)

if (!pending.value && !recipe.value) {
  throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
}

const recipeId = computed(() => recipe.value?.id)
const selectedBranchId = computed(() => {
  const queryBranch = Number(route.query.branch)
  if (!isNaN(queryBranch) && queryBranch > 0) return queryBranch
  return recipe.value?.defaultBranch?.id
})

const branchName = computed(() => {
  const branch = recipe.value?.branches?.find((b: any) => b.id === selectedBranchId.value)
  return branch?.name || 'main'
})

// ── Ingredient editing ───────────────────────────────────────
const ingredients = ref<any[]>([])
const steps = ref<any[]>([])

// ── Commit ───────────────────────────────────────────────────
const commitMessage = ref('')
const committing = ref(false)

async function commitChanges() {
  if (!commitMessage.value.trim() || !recipeId.value) return
  committing.value = true

  try {
    await $fetch(`/api/recipes/${recipeId.value}/commits`, {
      method: 'POST',
      body: {
        message: commitMessage.value,
        branchId: selectedBranchId.value,
        ingredients: ingredients.value.map((ing: any, i: number) => ({
          ingredientId: ing.ingredientId,
          quantity: String(ing.quantity),
          unit: ing.unit || 'g',
          notes: ing.notes || null,
          sortOrder: i,
        })),
        steps: steps.value.map((step: any, i: number) => ({
          sortOrder: i + 1,
          content: step.content,
        })),
      },
    })

    toast.add({ title: t('recipe.committed'), icon: 'i-lucide-check', color: 'success' })
    commitMessage.value = ''
    await refresh()
  }
  catch (err: any) {
    toast.add({
      title: err.data?.statusMessage || t('common.error'),
      icon: 'i-lucide-alert-circle',
      color: 'error',
    })
  }
  finally {
    committing.value = false
  }
}

useSeoMeta({
  title: () => recipe.value ? `${t('common.edit')}: ${recipe.value.title} — GourMerge` : 'GourMerge',
})
</script>

<template>
  <div class="max-w-4xl mx-auto py-8 px-4">
    <div v-if="pending" class="space-y-4">
      <USkeleton class="h-8 w-1/2" />
      <USkeleton class="h-64 w-full rounded-xl" />
    </div>

    <div v-else-if="recipe">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <div class="flex items-center gap-1 text-sm text-[var(--ui-text-muted)] mb-1">
            <UIcon name="i-lucide-git-branch" class="size-4 text-primary-500" />
            <span>{{ branchName }}</span>
          </div>
          <h1 class="text-2xl font-bold">{{ recipe.title }}</h1>
        </div>

        <div class="flex items-center gap-2">
          <UButton
            :label="t('recipe.view')"
            icon="i-lucide-eye"
            variant="outline"
            color="neutral"
            :to="recipeUrl"
          />
          <UButton
            :label="t('recipe.commitChanges')"
            icon="i-lucide-git-commit-vertical"
            :loading="committing"
            @click="commitChanges"
          />
        </div>
      </div>

      <!-- Ingredients Section -->
      <UCard class="mb-6">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-shopping-basket" class="size-5 text-primary-500" />
              <h2 class="font-semibold">{{ t('recipe.ingredients') }}</h2>
            </div>
            <UButton :label="t('recipe.addIngredient')" icon="i-lucide-plus" variant="outline" size="xs" />
          </div>
        </template>

        <div v-if="ingredients.length === 0" class="text-center py-6 text-[var(--ui-text-muted)]">
          {{ t('recipe.noIngredients') }}
        </div>
      </UCard>

      <!-- Steps Section -->
      <UCard class="mb-6">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-list-ordered" class="size-5 text-primary-500" />
              <h2 class="font-semibold">{{ t('recipe.steps') }}</h2>
            </div>
            <UButton :label="t('recipe.addStep')" icon="i-lucide-plus" variant="outline" size="xs" />
          </div>
        </template>

        <div v-if="steps.length === 0" class="text-center py-6 text-[var(--ui-text-muted)]">
          {{ t('recipe.noSteps') }}
        </div>
      </UCard>

      <!-- Commit message -->
      <UCard>
        <div class="flex items-end gap-3">
          <UFormField :label="t('recipe.commitMessage')" class="flex-1">
            <UInput v-model="commitMessage" :placeholder="t('recipe.commitPlaceholder')" icon="i-lucide-git-commit-vertical" />
          </UFormField>
          <UButton
            :label="t('recipe.commitChanges')"
            icon="i-lucide-git-commit-vertical"
            :disabled="!commitMessage.trim()"
            :loading="committing"
            @click="commitChanges"
          />
        </div>
      </UCard>
    </div>
  </div>
</template>
