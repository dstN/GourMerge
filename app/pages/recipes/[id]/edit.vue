<script setup lang="ts">
/**
 * Recipe Edit Page — The core editor with ingredient + step editors
 *
 * Allows users to edit ingredients and steps, then commit changes.
 */

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()
const route = useRoute()
const { user } = useUserSession()

const recipeId = computed(() => route.params.id as string)

const { data: recipe, pending, refresh } = useFetch(`/api/recipes/${recipeId.value}`, {
  headers: useRequestHeaders(['cookie']),
})

// ── Local editing state ───────────────────────────────────────

const editedIngredients = ref<any[]>([])
const editedSteps = ref<any[]>([])
const showCommitDialog = ref(false)
const commitMessage = ref('')
const saving = ref(false)

// Initialize editing state when recipe loads
watch(recipe, (r) => {
  if (r) {
    editedIngredients.value = r.currentIngredients.map((ing: any) => ({ ...ing }))
    editedSteps.value = r.currentSteps.map((step: any) => ({ ...step }))
  }
}, { immediate: true })

// ── Ingredient management ─────────────────────────────────────

function addIngredient() {
  editedIngredients.value.push({
    ingredientId: null,
    ingredientName: '',
    quantity: '',
    unit: 'g',
    notes: '',
    sortOrder: editedIngredients.value.length,
  })
}

function removeIngredient(idx: number) {
  editedIngredients.value.splice(idx, 1)
  editedIngredients.value.forEach((ing, i) => ing.sortOrder = i)
}

// ── Step management ───────────────────────────────────────────

function addStep() {
  editedSteps.value.push({
    sortOrder: editedSteps.value.length + 1,
    content: '',
  })
}

function removeStep(idx: number) {
  editedSteps.value.splice(idx, 1)
  editedSteps.value.forEach((step, i) => step.sortOrder = i + 1)
}

// ── Commit ────────────────────────────────────────────────────

async function handleCommit() {
  if (!recipe.value || !commitMessage.value.trim()) return

  saving.value = true
  try {
    await $fetch(`/api/recipes/${recipeId.value}/commits`, {
      method: 'POST',
      body: {
        message: commitMessage.value,
        branchId: recipe.value.defaultBranch.id,
        ingredients: editedIngredients.value
          .filter((ing: any) => ing.ingredientId)
          .map((ing: any) => ({
            ingredientId: ing.ingredientId,
            quantity: String(ing.quantity),
            unit: ing.unit,
            notes: ing.notes || null,
            sortOrder: ing.sortOrder,
          })),
        steps: editedSteps.value
          .filter((step: any) => step.content.trim())
          .map((step: any) => ({
            sortOrder: step.sortOrder,
            content: step.content,
          })),
      },
    })

    showCommitDialog.value = false
    commitMessage.value = ''
    await refresh()
  }
  catch (err: any) {
    console.error('Commit failed:', err)
  }
  finally {
    saving.value = false
  }
}

const unitOptions = [
  { label: 'g', value: 'g' },
  { label: 'ml', value: 'ml' },
  { label: t('recipe.unitPiece'), value: 'piece' },
  { label: t('recipe.unitPinch'), value: 'pinch' },
  { label: 'tsp', value: 'tsp' },
  { label: 'tbsp', value: 'tbsp' },
]

useSeoMeta({
  title: () => recipe.value ? `${t('common.edit')}: ${recipe.value.title} — GourMerge` : 'GourMerge',
})
</script>

<template>
  <div class="max-w-4xl">
    <!-- Loading -->
    <div v-if="pending" class="space-y-4">
      <USkeleton class="h-8 w-2/3" />
      <USkeleton class="h-64 w-full rounded-xl" />
    </div>

    <div v-else-if="recipe">
      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <div>
          <div class="flex items-center gap-2 text-sm text-[var(--ui-text-muted)] mb-1">
            <UIcon name="i-lucide-git-branch" class="size-4" />
            {{ recipe.defaultBranch?.name || 'main' }}
          </div>
          <h1 class="text-3xl font-bold">{{ recipe.title }}</h1>
        </div>

        <div class="flex items-center gap-2">
          <UButton
            :label="t('recipe.viewRecipe')"
            icon="i-lucide-eye"
            variant="outline"
            color="neutral"
            :to="`/recipes/${recipe.id}`"
          />
          <UButton
            :label="t('recipe.commitChanges')"
            icon="i-lucide-git-commit-horizontal"
            @click="showCommitDialog = true"
          />
        </div>
      </div>

      <!-- ── Ingredient Editor ─────────────────────────────── -->
      <UCard class="mb-6">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-shopping-basket" class="size-5 text-primary-500" />
              <h2 class="text-lg font-semibold">{{ t('recipe.ingredients') }}</h2>
            </div>
            <UButton
              :label="t('recipe.addIngredient')"
              icon="i-lucide-plus"
              variant="soft"
              size="sm"
              @click="addIngredient"
            />
          </div>
        </template>

        <div v-if="editedIngredients.length === 0" class="text-center py-8 text-[var(--ui-text-muted)]">
          {{ t('recipe.noIngredients') }}
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="(ing, idx) in editedIngredients"
            :key="idx"
            class="flex items-center gap-3 p-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg)]"
          >
            <UIcon name="i-lucide-grip-vertical" class="size-4 text-[var(--ui-text-dimmed)] cursor-grab shrink-0" />

            <UInput
              v-model="ing.ingredientName"
              :placeholder="t('recipe.ingredientName')"
              class="flex-1"
              size="sm"
            />

            <UInput
              v-model="ing.quantity"
              :placeholder="t('recipe.quantity')"
              type="number"
              class="w-24"
              size="sm"
            />

            <USelect
              v-model="ing.unit"
              :items="unitOptions"
              value-key="value"
              class="w-24"
              size="sm"
            />

            <UInput
              v-model="ing.notes"
              :placeholder="t('recipe.notes')"
              class="w-32"
              size="sm"
            />

            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              @click="removeIngredient(idx)"
            />
          </div>
        </div>
      </UCard>

      <!-- ── Step Editor ───────────────────────────────────── -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-list-ordered" class="size-5 text-primary-500" />
              <h2 class="text-lg font-semibold">{{ t('recipe.steps') }}</h2>
            </div>
            <UButton
              :label="t('recipe.addStep')"
              icon="i-lucide-plus"
              variant="soft"
              size="sm"
              @click="addStep"
            />
          </div>
        </template>

        <div v-if="editedSteps.length === 0" class="text-center py-8 text-[var(--ui-text-muted)]">
          {{ t('recipe.noSteps') }}
        </div>

        <div v-else class="space-y-4">
          <div
            v-for="(step, idx) in editedSteps"
            :key="idx"
            class="rounded-lg border border-[var(--ui-border)] overflow-hidden"
          >
            <div class="flex items-center justify-between px-4 py-2 bg-[var(--ui-bg-elevated)]">
              <span class="text-sm font-semibold">
                {{ t('diff.stepNumber', { n: step.sortOrder }) }}
              </span>
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="xs"
                @click="removeStep(idx)"
              />
            </div>
            <UTextarea
              v-model="step.content"
              :placeholder="t('recipe.stepPlaceholder')"
              :rows="4"
              class="border-none rounded-none"
            />
          </div>
        </div>
      </UCard>

      <!-- ── Commit Dialog ─────────────────────────────────── -->
      <UModal v-model:open="showCommitDialog">
        <template #content>
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-git-commit-horizontal" class="size-5 text-primary-500" />
                <h3 class="text-lg font-semibold">{{ t('recipe.commitChanges') }}</h3>
              </div>
            </template>

            <div class="space-y-4">
              <UFormField :label="t('recipe.commitMessage')">
                <UInput
                  v-model="commitMessage"
                  :placeholder="t('recipe.commitMessagePlaceholder')"
                  icon="i-lucide-message-square"
                  size="lg"
                  autofocus
                />
              </UFormField>

              <div class="flex items-center gap-2 text-sm text-[var(--ui-text-muted)]">
                <UIcon name="i-lucide-info" class="size-4" />
                {{ t('recipe.commitHint') }}
              </div>
            </div>

            <template #footer>
              <div class="flex justify-end gap-2">
                <UButton
                  :label="t('common.cancel')"
                  variant="outline"
                  color="neutral"
                  @click="showCommitDialog = false"
                />
                <UButton
                  :label="t('recipe.commit')"
                  icon="i-lucide-check"
                  :loading="saving"
                  :disabled="!commitMessage.trim()"
                  @click="handleCommit"
                />
              </div>
            </template>
          </UCard>
        </template>
      </UModal>
    </div>
  </div>
</template>
