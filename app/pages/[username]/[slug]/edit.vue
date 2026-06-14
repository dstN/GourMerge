<script setup lang="ts">
/**
 * Recipe Editor — /:username/:slug/edit
 *
 * Allows owners to edit ingredients (via autocomplete) and preparation steps
 * (via TipTap WYSIWYG) and commit a snapshot to any branch.
 */
import IngredientRow from '~/components/recipe/IngredientRow.vue'
import type { IngredientRowData } from '~/components/recipe/IngredientRow.vue'
import StepEditor from '~/components/recipe/StepEditor.vue'
import type { RecipeDetail } from '~~/shared/types/recipe'
import type { CanonicalUnit } from '~~/shared/types'

definePageMeta({ layout: 'dashboard', middleware: ['validate-recipe-route', 'auth'] })

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const username = computed(() => route.params.username as string)
const slug = computed(() => route.params.slug as string)

// ── Fetch recipe ──────────────────────────────────────────────
const { data: recipe, pending } = await useFetch<RecipeDetail>(
  () => `/api/recipes/by-slug/${username.value}/${slug.value}`,
  { headers: useRequestHeaders(['cookie']) },
)

if (!recipe.value) {
  throw createError({ statusCode: 404, statusMessage: t('recipe.notFound') })
}

// ── Metadata state ────────────────────────────────────────────
const selectedDietaryType = ref<string>(recipe.value?.dietaryType ?? '')
const currentTags = ref<string[]>(recipe.value?.tags ?? [])
const tagInput = ref('')

const { data: availableTags } = useFetch<Array<{ id: number; name: string }>>('/api/tags')

const dietaryOptions = computed(() => [
  { label: t('recipe.dietaryUnspecified'), value: '' },
  { label: t('recipe.dietaryVegan'), value: 'vegan' },
  { label: t('recipe.dietaryVegetarian'), value: 'vegetarian' },
  { label: t('recipe.dietaryPescatarian'), value: 'pescatarian' },
  { label: t('recipe.dietaryOmnivore'), value: 'omnivore' },
])

function addTag(raw: string) {
  const tag = raw.trim().toLowerCase()
  if (tag && !currentTags.value.includes(tag)) {
    currentTags.value.push(tag)
  }
  tagInput.value = ''
}

function removeTag(tag: string) {
  currentTags.value = currentTags.value.filter((existing) => existing !== tag)
}

function onTagInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    addTag(tagInput.value)
  }
}

// ── Branch selection ──────────────────────────────────────────
const selectedBranchId = computed(() => {
  const queryBranch = Number(route.query.branch)
  if (!isNaN(queryBranch) && queryBranch > 0) return queryBranch
  return recipe.value?.defaultBranch?.id
})

const currentBranch = computed(() =>
  recipe.value?.branches?.find((b) => b.id === selectedBranchId.value)
    ?? recipe.value?.defaultBranch
)

// ── Load branch snapshot when branch changes ──────────────────
const ingredients = ref<IngredientRowData[]>([])
const steps = ref<{ content: string }[]>([])
const snapshotLoading = ref(false)

async function loadBranchSnapshot(branchId: number) {
  snapshotLoading.value = true
  try {
    const snapshot = await $fetch<{
      ingredients: Array<{ ingredientId: number | null; ingredientName: string; quantity: string; unit: CanonicalUnit; notes: string | null; sortOrder: number }>
      steps: Array<{ content: string }>
    }>(`/api/recipes/${recipe.value!.id}/branches/${branchId}/snapshot`, {
      query: { locale: locale.value },
    })

    ingredients.value = snapshot.ingredients.map((ing) => ({
      ingredientId: ing.ingredientId,
      name: ing.ingredientName,
      quantity: String(ing.quantity),
      unit: ing.unit,
      notes: ing.notes ?? '',
      sortOrder: ing.sortOrder,
    }))
    steps.value = snapshot.steps.map((s) => ({ content: s.content }))
  } catch {
    ingredients.value = []
    steps.value = []
  } finally {
    snapshotLoading.value = false
  }
}

// On initial load, use the default branch data from the by-slug fetch
watchEffect(() => {
  if (!recipe.value) return
  const branchId = selectedBranchId.value
  if (!branchId) return
  loadBranchSnapshot(branchId)
})

// ── Dirty state tracking ──────────────────────────────────────
const initialSnapshot = ref('')
const isDirty = computed(() => {
  const current = JSON.stringify({ ingredients: ingredients.value, steps: steps.value })
  return current !== initialSnapshot.value
})

watch([ingredients, steps], () => {
  if (initialSnapshot.value === '') {
    initialSnapshot.value = JSON.stringify({ ingredients: ingredients.value, steps: steps.value })
  }
}, { deep: true, once: true })

onBeforeRouteLeave((to, from, next) => {
  if (isDirty.value) {
    if (window.confirm(t('recipe.unsavedChanges'))) {
      next()
    } else {
      next(false)
    }
  } else {
    next()
  }
})

// ── Ingredient management ─────────────────────────────────────
function addIngredient() {
  ingredients.value.push({
    ingredientId: null,
    name: '',
    quantity: '',
    unit: 'g',
    notes: '',
    sortOrder: ingredients.value.length,
  })
}

function removeIngredient(index: number) {
  ingredients.value.splice(index, 1)
}

function updateIngredient(index: number, value: IngredientRowData) {
  ingredients.value[index] = value
}

// ── Step management ───────────────────────────────────────────
function addStep() {
  steps.value.push({ content: '' })
}

function removeStep(index: number) {
  steps.value.splice(index, 1)
}

function updateStepContent(index: number, content: string) {
  const step = steps.value[index]
  if (step) step.content = content
}

// ── Commit ────────────────────────────────────────────────────
const commitMessage = ref('')
const committing = ref(false)

async function commitChanges() {
  if (!commitMessage.value.trim() || !recipe.value || !selectedBranchId.value) return

  // Validate: every ingredient must have a name and quantity
  const invalid = ingredients.value.some((ing) => !ing.name.trim() || !ing.quantity)
  if (invalid) {
    toast.add({ title: t('recipe.ingredientIncomplete'), color: 'error', icon: 'i-lucide-alert-circle' })
    return
  }

  committing.value = true
  try {
    // Resolve any new ingredients (create-on-write)
    const resolvedIngredients = await Promise.all(
      ingredients.value.map(async (ing, i) => {
        if (ing.ingredientId !== null) {
          return { ingredientId: ing.ingredientId, quantity: ing.quantity, unit: ing.unit, notes: ing.notes || null, sortOrder: i }
        }
        // Create the new ingredient
        const created = await $fetch<{ id: number }>('/api/ingredients', {
          method: 'POST',
          body: { name: ing.name },
        })
        return { ingredientId: created.id, quantity: ing.quantity, unit: ing.unit, notes: ing.notes || null, sortOrder: i }
      })
    )

    await $fetch(`/api/recipes/${recipe.value.id}/commits`, {
      method: 'POST',
      body: {
        message: commitMessage.value,
        branchId: selectedBranchId.value,
        ingredients: resolvedIngredients,
        steps: steps.value.map((s, i) => ({
          sortOrder: i + 1,
          content: s.content,
        })),
      },
    })

    // Save dietary type and tags alongside the commit
    await Promise.all([
      $fetch(`/api/recipes/${recipe.value.id}`, {
        method: 'PATCH',
        body: { dietaryType: selectedDietaryType.value || null },
      }),
      $fetch(`/api/recipes/${recipe.value.id}/tags`, {
        method: 'POST',
        body: { tags: currentTags.value },
      }),
    ])

    toast.add({
      title: t('recipe.commitSuccess'),
      icon: 'i-lucide-git-commit-vertical',
      color: 'success',
    })
    commitMessage.value = ''
    // Reset dirty tracking after successful commit
    initialSnapshot.value = JSON.stringify({ ingredients: ingredients.value, steps: steps.value })
  } catch (err: unknown) {
    toast.add({
      title: (err as { data?: { statusMessage?: string } })?.data?.statusMessage || t('recipe.commitError'),
      icon: 'i-lucide-alert-circle',
      color: 'error',
    })
  } finally {
    committing.value = false
  }
}

useSeoMeta({
  title: () => recipe.value ? `${t('common.edit')}: ${recipe.value.title} — GourMerge` : 'GourMerge',
})
</script>

<template>
  <div class="max-w-4xl mx-auto py-8 px-4">
    <div v-if="pending || snapshotLoading" class="space-y-4">
      <USkeleton class="h-8 w-1/2" />
      <USkeleton class="h-64 w-full rounded-xl" />
    </div>

    <template v-else-if="recipe">
      <!-- Header ──────────────────────────────────────────────── -->
      <div class="flex items-start justify-between mb-6 gap-4">
        <div>
          <div class="flex items-center gap-1.5 text-sm text-neutral-500 mb-1">
            <UIcon name="i-lucide-git-branch" class="size-4 text-primary-500" />
            <span>{{ currentBranch?.name ?? 'main' }}</span>
            <UBadge v-if="isDirty" size="xs" color="warning" variant="soft">{{ t('common.unsaved') }}</UBadge>
          </div>
          <h1 class="text-2xl font-bold">{{ recipe.title }}</h1>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <!-- Branch selector -->
          <USelect
            v-if="recipe.branches?.length > 1"
            :model-value="selectedBranchId"
            :items="recipe.branches.map((b: any) => ({ label: b.name, value: b.id }))"
            value-key="value"
            size="sm"
            icon="i-lucide-git-branch"
            @update:model-value="(val) => router.replace({ query: { branch: val } })"
          />
          <UButton
            :label="t('recipe.viewRecipe')"
            icon="i-lucide-eye"
            variant="outline"
            color="neutral"
            size="sm"
            :to="`/${username}/${slug}`"
          />
        </div>
      </div>

      <!-- Metadata ────────────────────────────────────────────── -->
      <UCard class="mb-6">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-settings" class="size-5 text-primary-500" />
            <h2 class="font-semibold">{{ t('recipe.metadata') }}</h2>
          </div>
        </template>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField :label="t('recipe.dietaryType')">
            <USelect
              v-model="selectedDietaryType"
              :items="dietaryOptions"
              value-key="value"
            />
          </UFormField>
          <UFormField label="Tags">
            <!-- Current tag chips -->
            <div class="flex flex-wrap gap-1 mb-2">
              <span
                v-for="tag in currentTags"
                :key="tag"
                class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary-500/10 text-primary-600 border border-primary-500/20"
              >
                {{ tag }}
                <button type="button" class="hover:text-error-500 transition-colors" @click="removeTag(tag)">
                  <UIcon name="i-lucide-x" class="size-3" />
                </button>
              </span>
            </div>
            <!-- Tag input -->
            <UInput
              v-model="tagInput"
              placeholder="Tag hinzufügen, Enter drücken"
              size="sm"
              @keydown="onTagInputKeydown"
              @blur="tagInput.trim() && addTag(tagInput)"
            />
            <!-- Suggestions from existing tags -->
            <div v-if="availableTags?.length" class="flex flex-wrap gap-1 mt-2">
              <button
                v-for="suggestion in availableTags.filter(s => !currentTags.includes(s.name)).slice(0, 10)"
                :key="suggestion.id"
                type="button"
                class="text-xs px-2 py-0.5 rounded-full border border-[var(--ui-border)] text-[var(--ui-text-muted)] hover:border-primary-500/50 transition-colors"
                @click="addTag(suggestion.name)"
              >+ {{ suggestion.name }}</button>
            </div>
          </UFormField>
        </div>
      </UCard>

      <!-- Ingredients ─────────────────────────────────────────── -->
      <UCard class="mb-6" data-tour="ingredient-section">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-shopping-basket" class="size-5 text-primary-500" />
              <h2 class="font-semibold">{{ t('recipe.ingredients') }}</h2>
              <UBadge v-if="ingredients.length > 0" size="xs" color="neutral" variant="soft">{{ ingredients.length }}</UBadge>
            </div>
            <UButton
              :label="t('recipe.addIngredient')"
              icon="i-lucide-plus"
              variant="outline"
              size="xs"
              data-tour="add-ingredient"
              @click="addIngredient"
            />
          </div>
        </template>

        <div v-if="ingredients.length === 0" class="text-center py-8 text-neutral-400 dark:text-neutral-500">
          <UIcon name="i-lucide-shopping-basket" class="size-10 mx-auto mb-2 opacity-30" />
          <p class="text-sm">{{ t('recipe.noIngredients') }}</p>
          <UButton
            :label="t('recipe.addIngredient')"
            icon="i-lucide-plus"
            variant="soft"
            size="sm"
            class="mt-3"
            @click="addIngredient"
          />
        </div>

        <div v-else class="space-y-2">
          <!-- Column headers -->
          <div class="grid grid-cols-[1.5rem_1fr_5rem_6rem_8rem_1.5rem] gap-2 px-1 text-xs text-neutral-400 font-medium hidden sm:grid">
            <span />
            <span>{{ t('recipe.ingredientName') }}</span>
            <span>{{ t('recipe.quantity') }}</span>
            <span>Unit</span>
            <span>{{ t('recipe.notes') }}</span>
            <span />
          </div>

          <IngredientRow
            v-for="(ing, i) in ingredients"
            :key="i"
            :model-value="ing"
            :index="i"
            @update:model-value="updateIngredient(i, $event)"
            @remove="removeIngredient(i)"
          />
        </div>
      </UCard>

      <!-- Steps ───────────────────────────────────────────────── -->
      <UCard class="mb-6" data-tour="steps-section">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-list-ordered" class="size-5 text-primary-500" />
              <h2 class="font-semibold">{{ t('recipe.steps') }}</h2>
              <UBadge v-if="steps.length > 0" size="xs" color="neutral" variant="soft">{{ steps.length }}</UBadge>
            </div>
            <UButton
              :label="t('recipe.addStep')"
              icon="i-lucide-plus"
              variant="outline"
              size="xs"
              data-tour="add-step"
              @click="addStep"
            />
          </div>
        </template>

        <div v-if="steps.length === 0" class="text-center py-8 text-neutral-400 dark:text-neutral-500">
          <UIcon name="i-lucide-list-ordered" class="size-10 mx-auto mb-2 opacity-30" />
          <p class="text-sm">{{ t('recipe.noSteps') }}</p>
          <UButton
            :label="t('recipe.addStep')"
            icon="i-lucide-plus"
            variant="soft"
            size="sm"
            class="mt-3"
            @click="addStep"
          />
        </div>

        <div v-else class="space-y-3">
          <ClientOnly>
            <StepEditor
              v-for="(step, i) in steps"
              :key="i"
              :model-value="step.content"
              :index="i"
              @update:model-value="updateStepContent(i, $event)"
              @remove="removeStep(i)"
            />
            <template #fallback>
              <div
                v-for="(step, i) in steps"
                :key="i"
                class="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 min-h-[4rem] text-sm text-neutral-500"
              >
                {{ step.content || t('recipe.stepPlaceholder') }}
              </div>
            </template>
          </ClientOnly>
        </div>
      </UCard>

      <!-- Commit panel ─────────────────────────────────────────── -->
      <UCard data-tour="commit-panel">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-git-commit-vertical" class="size-5 text-primary-500" />
            <h2 class="font-semibold">{{ t('recipe.commitChanges') }}</h2>
          </div>
        </template>

        <div class="flex flex-col sm:flex-row items-start sm:items-end gap-3">
          <UFormField :label="t('recipe.commitMessage')" :hint="t('recipe.commitHint')" class="flex-1">
            <UInput
              v-model="commitMessage"
              :placeholder="t('recipe.commitMessagePlaceholder')"
              icon="i-lucide-git-commit-vertical"
              data-tour="commit-message"
            />
          </UFormField>
          <UButton
            :label="t('recipe.commit')"
            icon="i-lucide-git-commit-vertical"
            :disabled="!commitMessage.trim() || committing"
            :loading="committing"
            data-tour="commit-button"
            @click="commitChanges"
          />
        </div>
      </UCard>
    </template>
  </div>
</template>
