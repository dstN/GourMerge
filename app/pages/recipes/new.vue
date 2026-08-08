<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()
const { apiError } = useApiError()
const tour = useProductTour()

useSeoMeta({
  title: `${t('nav.newRecipe')}: GourMerge`,
})

const loading = ref(false)
const error = ref('')

const schema = z.object({
  title: z
    .string()
    .min(2, t('recipe.titleRequired'))
    .max(300, t('validation.tooLong', { max: 300 })),
  description: z
    .string()
    .max(5000, t('validation.tooLong', { max: 5000 }))
    .optional(),
  servings: z
    .number()
    .int()
    .min(1, t('validation.numberRange', { min: 1, max: 100 }))
    .max(100, t('validation.numberRange', { min: 1, max: 100 }))
    .default(4),
  prepTimeMinutes: z
    .number()
    .int()
    .min(0, t('validation.numberRange', { min: 0, max: 1440 }))
    .max(1440, t('validation.numberRange', { min: 0, max: 1440 }))
    .optional(),
  cookTimeMinutes: z
    .number()
    .int()
    .min(0, t('validation.numberRange', { min: 0, max: 1440 }))
    .max(1440, t('validation.numberRange', { min: 0, max: 1440 }))
    .optional(),
  difficulty: z.enum(['easy', 'medium', 'hard'], { message: t('validation.selectOption') }).default('medium'),
  visibility: z.enum(['public', 'private'], { message: t('validation.selectOption') }).default('public'),
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  title: '',
  description: '',
  servings: 4,
  prepTimeMinutes: undefined,
  cookTimeMinutes: undefined,
  difficulty: 'medium',
  // tour.active (shared singleton), not a ?tour=1 query — true regardless of which entry
  // path got them here. Defaults private during the tour: publishing needs a verified
  // email the tour hasn't required yet; select below still allows public.
  visibility: tour.active.value ? 'private' : 'public',
})

const difficultyOptions = computed(() => [
  { label: t('recipe.easy'), value: 'easy' },
  { label: t('recipe.medium'), value: 'medium' },
  { label: t('recipe.hard'), value: 'hard' },
])

const visibilityOptions = computed(() => [
  { label: t('recipe.public'), value: 'public' },
  { label: t('recipe.private'), value: 'private' },
])

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  error.value = ''

  try {
    const result = await $fetch('/api/recipes', {
      method: 'POST',
      body: event.data,
    })
    navigateTo(`/${result.owner.username}/${result.slug}/edit`)
  } catch (err: unknown) {
    error.value = apiError(err, 'recipe.createError')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <CommonPageShell width="form">
    <CommonPageHeader :title="t('recipe.createTitle')" :subtitle="t('recipe.createSubtitle')" />

    <UCard>
      <UForm :schema="schema" :state="state" class="space-y-6" @submit="onSubmit">
        <UAlert v-if="error" color="error" icon="i-lucide-alert-circle" :title="error" />

        <UFormField :label="t('recipe.title')" name="title" required>
          <UInput
            v-model="state.title"
            :placeholder="t('recipe.titlePlaceholder')"
            icon="i-lucide-chef-hat"
            data-tour="recipe-form-title"
          />
        </UFormField>

        <UFormField :label="t('recipe.description')" name="description">
          <UTextarea v-model="state.description" :placeholder="t('recipe.descriptionPlaceholder')" :rows="3" />
        </UFormField>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <UFormField :label="t('recipe.servingsLabel')" name="servings">
            <UInput v-model.number="state.servings" type="number" :min="1" :max="100" icon="i-lucide-users" />
          </UFormField>

          <UFormField :label="t('recipe.prepTime')" name="prepTimeMinutes">
            <UInput
              v-model.number="state.prepTimeMinutes"
              type="number"
              :min="0"
              icon="i-lucide-clock"
              :placeholder="t('recipe.minutes')"
            />
          </UFormField>

          <UFormField :label="t('recipe.cookTime')" name="cookTimeMinutes">
            <UInput
              v-model.number="state.cookTimeMinutes"
              type="number"
              :min="0"
              icon="i-lucide-flame"
              :placeholder="t('recipe.minutes')"
            />
          </UFormField>
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <UFormField :label="t('recipe.difficultyLabel')" name="difficulty">
            <USelect v-model="state.difficulty" :items="difficultyOptions" value-key="value" />
          </UFormField>

          <UFormField :label="t('recipe.visibilityLabel')" name="visibility">
            <USelect v-model="state.visibility" :items="visibilityOptions" value-key="value" />
          </UFormField>
        </div>

        <UButton
          type="submit"
          :label="t('recipe.createButton')"
          icon="i-lucide-plus"
          size="lg"
          block
          :loading="loading"
          data-tour="recipe-form-submit"
        />
      </UForm>
    </UCard>
  </CommonPageShell>
</template>
