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
  { headers: useRequestHeaders(['cookie']) }
)

if (!recipe.value) {
  throw createError({ statusCode: 404, statusMessage: t('recipe.notFound') })
}

// ── Metadata state ────────────────────────────────────────────
const metaTitle = ref('')
const metaDescription = ref('')
const metaServings = ref<number>(1)
const metaPrepTime = ref<number | null>(null)
const metaCookTime = ref<number | null>(null)
const metaDifficulty = ref('medium')
const metaVisibility = ref('public')
const selectedDietaryType = ref('none')
const currentTags = ref<string[]>([])
const tagInput = ref('')
const metaTitleTranslations = ref<Record<'de' | 'en' | 'fr' | 'it', string>>({ de: '', en: '', fr: '', it: '' })
const metaDescriptionTranslations = ref<Record<'de' | 'en' | 'fr' | 'it', string>>({ de: '', en: '', fr: '', it: '' })
const metaTranslationsOpen = ref(false)

const { data: availableTags } = useFetch<Array<{ id: number; name: string }>>('/api/tags')

const dietaryOptions = computed(() => [
  { label: t('recipe.dietaryUnspecified'), value: 'none' },
  { label: t('recipe.dietaryVegan'), value: 'vegan' },
  { label: t('recipe.dietaryVegetarian'), value: 'vegetarian' },
  { label: t('recipe.dietaryPescatarian'), value: 'pescatarian' },
  { label: t('recipe.dietaryOmnivore'), value: 'omnivore' },
])

const difficultyOptions = computed(() => [
  { label: t('recipe.easy'), value: 'easy' },
  { label: t('recipe.medium'), value: 'medium' },
  { label: t('recipe.hard'), value: 'hard' },
])

const visibilityOptions = computed(() => [
  { label: t('recipe.public'), value: 'public' },
  { label: t('recipe.private'), value: 'private' },
])

// Sync all metadata from recipe when it loads
watch(
  recipe,
  (r) => {
    if (!r) return
    metaTitle.value = r.title ?? ''
    metaDescription.value = r.description ?? ''
    metaServings.value = r.servings ?? 1
    metaPrepTime.value = r.prepTimeMinutes ?? null
    metaCookTime.value = r.cookTimeMinutes ?? null
    metaDifficulty.value = r.difficulty ?? 'medium'
    metaVisibility.value = r.visibility ?? 'public'
    selectedDietaryType.value = r.dietaryType ?? 'none'
    currentTags.value = r.tags ?? []
    metaTitleTranslations.value = (r.titleTranslations as Record<'de' | 'en' | 'fr' | 'it', string>) ?? {
      de: '',
      en: '',
      fr: '',
      it: '',
    }
    metaDescriptionTranslations.value = (r.descriptionTranslations as Record<'de' | 'en' | 'fr' | 'it', string>) ?? {
      de: '',
      en: '',
      fr: '',
      it: '',
    }
  },
  { immediate: true }
)

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

const currentBranch = computed(
  () => recipe.value?.branches?.find((b) => b.id === selectedBranchId.value) ?? recipe.value?.defaultBranch
)

// ── Load branch snapshot when branch changes ──────────────────
const ingredients = ref<IngredientRowData[]>([])

interface EditStep {
  content: string
  contentTranslations: Record<'de' | 'en' | 'fr' | 'it', string>
  translationsOpen: boolean
}
const steps = ref<EditStep[]>([])
const snapshotLoading = ref(false)

async function loadBranchSnapshot(branchId: number) {
  snapshotLoading.value = true
  try {
    const snapshot = await $fetch<{
      ingredients: Array<{
        ingredientId: number | null
        ingredientName: string
        quantity: string
        unit: CanonicalUnit
        notes: string | null
        sortOrder: number
      }>
      steps: Array<{ content: string; contentTranslations: Record<string, string> | null }>
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
    steps.value = snapshot.steps.map((s) => ({
      content: s.content,
      contentTranslations: (s.contentTranslations as Record<'de' | 'en' | 'fr' | 'it', string>) ?? {
        de: '',
        en: '',
        fr: '',
        it: '',
      },
      translationsOpen: false,
    }))
    // Capture baseline for dirty tracking after both values are set
    initialSnapshot.value = JSON.stringify({ ingredients: ingredients.value, steps: stepsForSnapshot.value })
  } catch {
    ingredients.value = []
    steps.value = []
    initialSnapshot.value = JSON.stringify({ ingredients: [], steps: [] })
  } finally {
    snapshotLoading.value = false
  }
}

// Load snapshot when branch selection changes (or on initial mount)
watch(
  selectedBranchId,
  (branchId) => {
    if (!branchId) return
    loadBranchSnapshot(branchId)
  },
  { immediate: true }
)

// ── Dirty state tracking ──────────────────────────────────────
// Exclude translationsOpen (local UI state) from dirty tracking
const stepsForSnapshot = computed(() =>
  steps.value.map(({ content, contentTranslations }) => ({ content, contentTranslations }))
)

// Start with empty baseline so isDirty is false before snapshot loads
const initialSnapshot = ref(JSON.stringify({ ingredients: [], steps: [] }))

const isDirty = computed(() => {
  const current = JSON.stringify({ ingredients: ingredients.value, steps: stepsForSnapshot.value })
  return current !== initialSnapshot.value
})

const showLeaveModal = ref(false)
const pendingLeaveRoute = ref('')
const allowLeave = ref(false)

onBeforeRouteLeave((to, from, next) => {
  if (!isDirty.value || allowLeave.value) {
    allowLeave.value = false
    next()
    return
  }
  pendingLeaveRoute.value = to.fullPath
  showLeaveModal.value = true
  next(false)
})

function confirmLeave() {
  showLeaveModal.value = false
  allowLeave.value = true
  navigateTo(pendingLeaveRoute.value)
}

function cancelLeave() {
  showLeaveModal.value = false
  pendingLeaveRoute.value = ''
}

// ── Delete recipe ─────────────────────────────────────────────
const showDeleteModal = ref(false)
const deleting = ref(false)

async function deleteRecipe() {
  if (!recipe.value) return
  deleting.value = true
  try {
    await $fetch(`/api/recipes/${recipe.value.id}`, { method: 'DELETE' })
    toast.add({ title: t('recipe.deleteSuccess'), icon: 'i-lucide-trash-2', color: 'success' })
    allowLeave.value = true
    await navigateTo('/recipes')
  } catch {
    toast.add({ title: t('recipe.deleteError'), icon: 'i-lucide-alert-circle', color: 'error' })
  } finally {
    deleting.value = false
    showDeleteModal.value = false
  }
}

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
  steps.value.push({ content: '', contentTranslations: { de: '', en: '', fr: '', it: '' }, translationsOpen: false })
}

function removeStep(index: number) {
  steps.value.splice(index, 1)
}

function updateStepContent(index: number, content: string) {
  const step = steps.value[index]
  if (step) step.content = content
}

function updateStepTranslation(i: number, loc: 'de' | 'en' | 'fr' | 'it', val: string) {
  const step = steps.value[i]
  if (step) step.contentTranslations[loc] = val
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
          return {
            ingredientId: ing.ingredientId,
            quantity: ing.quantity,
            unit: ing.unit,
            notes: ing.notes || null,
            sortOrder: i,
          }
        }
        // Create the new ingredient
        const created = await $fetch<{ id: number }>('/api/ingredients', {
          method: 'POST',
          body: { name: ing.name },
        })
        return {
          ingredientId: created.id,
          quantity: ing.quantity,
          unit: ing.unit,
          notes: ing.notes || null,
          sortOrder: i,
        }
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
          contentTranslations: (() => {
            const translations = Object.fromEntries(
              Object.entries(s.contentTranslations).filter(([, v]) => v.trim() !== '')
            )
            return Object.keys(translations).length > 0 ? translations : null
          })(),
        })),
      },
    })

    // Save recipe metadata and tags alongside the commit
    await Promise.all([
      $fetch(`/api/recipes/${recipe.value.id}`, {
        method: 'PATCH',
        body: {
          title: metaTitle.value.trim() || undefined,
          description: metaDescription.value.trim() || undefined,
          servings: metaServings.value || undefined,
          prepTimeMinutes: metaPrepTime.value ?? null,
          cookTimeMinutes: metaCookTime.value ?? null,
          difficulty: (metaDifficulty.value as 'easy' | 'medium' | 'hard') || undefined,
          visibility: (metaVisibility.value as 'public' | 'private') || undefined,
          dietaryType: selectedDietaryType.value === 'none' ? null : selectedDietaryType.value,
          titleTranslations: (() => {
            const tr = Object.fromEntries(
              Object.entries(metaTitleTranslations.value).filter(([, v]) => v.trim() !== '')
            )
            return Object.keys(tr).length > 0 ? tr : null
          })(),
          descriptionTranslations: (() => {
            const tr = Object.fromEntries(
              Object.entries(metaDescriptionTranslations.value).filter(([, v]) => v.trim() !== '')
            )
            return Object.keys(tr).length > 0 ? tr : null
          })(),
        },
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
    initialSnapshot.value = JSON.stringify({ ingredients: ingredients.value, steps: stepsForSnapshot.value })
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
  title: () => (recipe.value ? `${t('common.edit')}: ${recipe.value.title} — GourMerge` : 'GourMerge'),
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
          <UButton
            :label="t('recipe.deleteTitle')"
            icon="i-lucide-trash-2"
            variant="outline"
            color="error"
            size="sm"
            @click="
              () => {
                showDeleteModal = true
              }
            "
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
        <div class="space-y-4">
          <!-- Title -->
          <UFormField :label="t('recipe.title')">
            <UInput v-model="metaTitle" :placeholder="t('recipe.titlePlaceholder')" class="w-full" />
          </UFormField>

          <!-- Description -->
          <UFormField :label="t('recipe.description')">
            <UTextarea
              v-model="metaDescription"
              :placeholder="t('recipe.descriptionPlaceholder')"
              :rows="2"
              class="w-full"
            />
          </UFormField>

          <!-- Title & description translations -->
          <div>
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              :icon="metaTranslationsOpen ? 'i-lucide-chevron-up' : 'i-lucide-languages'"
              :label="metaTranslationsOpen ? t('recipe.hideTranslations') : t('recipe.addTranslations')"
              @click="
                () => {
                  metaTranslationsOpen = !metaTranslationsOpen
                }
              "
            />
          </div>

          <div v-if="metaTranslationsOpen" class="ml-4 border-l-2 border-primary-500/20 pl-3 space-y-4">
            <p class="text-xs text-neutral-400">{{ t('recipe.metaTranslationsHint') }}</p>
            <div v-for="loc in ['de', 'en', 'fr', 'it'] as const" :key="loc" class="space-y-2">
              <p class="text-xs font-semibold text-neutral-500 uppercase">{{ loc }}</p>
              <UFormField :label="t('recipe.title')">
                <UInput
                  v-model="metaTitleTranslations[loc]"
                  :placeholder="t('recipe.titlePlaceholder')"
                  class="w-full"
                />
              </UFormField>
              <UFormField :label="t('recipe.description')">
                <UTextarea
                  v-model="metaDescriptionTranslations[loc]"
                  :placeholder="t('recipe.descriptionPlaceholder')"
                  :rows="2"
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>

          <!-- Times, servings, difficulty, visibility -->
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <UFormField :label="t('recipe.servingsLabel')">
              <UInput v-model.number="metaServings" type="number" min="1" max="100" />
            </UFormField>
            <UFormField :label="`${t('recipe.prepTime')} (min)`">
              <UInput v-model.number="metaPrepTime" type="number" min="0" />
            </UFormField>
            <UFormField :label="`${t('recipe.cookTime')} (min)`">
              <UInput v-model.number="metaCookTime" type="number" min="0" />
            </UFormField>
            <UFormField :label="t('recipe.difficultyLabel')">
              <USelect v-model="metaDifficulty" :items="difficultyOptions" value-key="value" />
            </UFormField>
            <UFormField :label="t('recipe.visibilityLabel')">
              <USelect v-model="metaVisibility" :items="visibilityOptions" value-key="value" />
            </UFormField>
          </div>

          <!-- Dietary type + Tags -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField :label="t('recipe.dietaryType')">
              <USelect v-model="selectedDietaryType" :items="dietaryOptions" value-key="value" />
            </UFormField>
            <UFormField label="Tags">
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
              <UInput
                v-model="tagInput"
                placeholder="Tag hinzufügen, Enter drücken"
                size="sm"
                @keydown="onTagInputKeydown"
                @blur="tagInput.trim() && addTag(tagInput)"
              />
              <div v-if="availableTags?.length" class="flex flex-wrap gap-1 mt-2">
                <button
                  v-for="suggestion in availableTags.filter((s) => !currentTags.includes(s.name)).slice(0, 10)"
                  :key="suggestion.id"
                  type="button"
                  class="text-xs px-2 py-0.5 rounded-full border border-[var(--ui-border)] text-[var(--ui-text-muted)] hover:border-primary-500/50 transition-colors"
                  @click="addTag(suggestion.name)"
                >
                  + {{ suggestion.name }}
                </button>
              </div>
            </UFormField>
          </div>
        </div>
      </UCard>

      <!-- Ingredients ─────────────────────────────────────────── -->
      <UCard class="mb-6" data-tour="ingredient-section">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-shopping-basket" class="size-5 text-primary-500" />
              <h2 class="font-semibold">{{ t('recipe.ingredients') }}</h2>
              <UBadge v-if="ingredients.length > 0" size="xs" color="neutral" variant="soft">{{
                ingredients.length
              }}</UBadge>
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
          <div
            class="grid grid-cols-[1.5rem_1fr_5rem_6rem_8rem_1.5rem] gap-2 px-1 text-xs text-neutral-400 font-medium hidden sm:grid"
          >
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
            <div v-for="(step, i) in steps" :key="i" class="space-y-1">
              <StepEditor
                :model-value="step.content"
                :index="i"
                @update:model-value="updateStepContent(i, $event)"
                @remove="removeStep(i)"
              />

              <div class="pl-1">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  :icon="step.translationsOpen ? 'i-lucide-chevron-up' : 'i-lucide-languages'"
                  :label="step.translationsOpen ? t('recipe.hideTranslations') : t('recipe.addTranslations')"
                  @click="
                    () => {
                      step.translationsOpen = !step.translationsOpen
                    }
                  "
                />
              </div>

              <div v-if="step.translationsOpen" class="ml-4 space-y-2 border-l-2 border-primary-500/20 pl-3">
                <p class="text-xs text-neutral-400">{{ t('recipe.translationsHint') }}</p>
                <div v-for="loc in ['de', 'en', 'fr', 'it'] as const" :key="loc">
                  <p class="text-xs font-medium text-neutral-500 mb-1 uppercase">{{ loc }}</p>
                  <StepEditor
                    :model-value="step.contentTranslations[loc]"
                    :index="i"
                    :placeholder="t('recipe.translationPlaceholder', { locale: loc })"
                    @update:model-value="updateStepTranslation(i, loc, $event)"
                    @remove="updateStepTranslation(i, loc, '')"
                  />
                </div>
              </div>
            </div>
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

    <!-- Delete recipe confirmation modal -->
    <UModal v-model:open="showDeleteModal" :title="t('recipe.deleteTitle')">
      <template #body>
        <p class="text-sm">{{ t('recipe.deleteConfirm') }}</p>
      </template>
      <template #footer>
        <div class="flex gap-2 justify-end w-full">
          <UButton
            variant="outline"
            color="neutral"
            :label="t('common.cancel')"
            :disabled="deleting"
            @click="
              () => {
                showDeleteModal = false
              }
            "
          />
          <UButton
            color="error"
            icon="i-lucide-trash-2"
            :label="t('common.delete')"
            :loading="deleting"
            @click="deleteRecipe"
          />
        </div>
      </template>
    </UModal>

    <!-- Unsaved changes confirmation modal -->
    <UModal v-model:open="showLeaveModal" :title="t('common.unsaved')">
      <template #body>
        <p class="text-sm">{{ t('recipe.unsavedChanges') }}</p>
      </template>
      <template #footer>
        <div class="flex gap-2 justify-end w-full">
          <UButton variant="outline" color="neutral" :label="t('common.cancel')" @click="cancelLeave" />
          <UButton color="error" :label="t('common.leave')" @click="confirmLeave" />
        </div>
      </template>
    </UModal>
  </div>
</template>
