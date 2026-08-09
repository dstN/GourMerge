<script setup lang="ts">
/**
 * EditIngredientModal — lets the ingredient's own creator fix a name, category or nutrition
 * value after the fact. The server enforces `created_by === viewer` independently
 * (`PATCH /api/ingredients/:id`); this component trusts `canEdit` from the recipe payload
 * only to decide whether to show the trigger at all, same as any other owner-only control.
 *
 * Mirrors `NewIngredientModal.vue`'s field set on purpose — editing is the same six
 * nutrition fields and the same four locale names, just pre-filled and PATCHed instead of
 * POSTed.
 */
const { t } = useI18n()
const { apiError } = useApiError()
const toast = useAppToast()

const LOCALES = ['de', 'en', 'fr', 'it'] as const
type Locale = (typeof LOCALES)[number]

const NUTRIENTS = [
  { key: 'energyKcal100g', label: 'kcal', unit: '' },
  { key: 'fat100g', labelKey: 'nutrition.fat', unit: 'g' },
  { key: 'saturatedFat100g', labelKey: 'nutrition.saturatedFat', unit: 'g' },
  { key: 'carbs100g', labelKey: 'nutrition.carbs', unit: 'g' },
  { key: 'fiber100g', labelKey: 'nutrition.fiber', unit: 'g' },
  { key: 'protein100g', labelKey: 'nutrition.protein', unit: 'g' },
] as const
type NutrientKey = (typeof NUTRIENTS)[number]['key']

interface IngredientDetail {
  id: number
  name: string
  nameTranslations: Record<string, string> | null
  category: string | null
  energyKcal100g: string | null
  protein100g: string | null
  carbs100g: string | null
  fat100g: string | null
  fiber100g: string | null
  saturatedFat100g: string | null
}

const props = defineProps<{ open: boolean; ingredientId: number }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; saved: [] }>()

const loading = ref(false)
const saving = ref(false)
const name = ref('')
const translations = ref<Record<Locale, string>>({ de: '', en: '', fr: '', it: '' })
const category = ref('')
const nutritionOpen = ref(false)
const nutrition = ref<Record<NutrientKey, string>>({
  energyKcal100g: '',
  fat100g: '',
  saturatedFat100g: '',
  carbs100g: '',
  fiber100g: '',
  protein100g: '',
})

const { data: categories } = await useFetch<string[]>('/api/ingredients/categories', { lazy: true, server: false })
const categoryItems = computed(() => (categories.value ?? []).map((c) => ({ label: c, value: c })))

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    loading.value = true
    try {
      const detail = await $fetch<IngredientDetail>(`/api/ingredients/${props.ingredientId}`)
      name.value = detail.name
      translations.value = { de: '', en: '', fr: '', it: '', ...detail.nameTranslations }
      category.value = detail.category ?? ''
      nutrition.value = {
        energyKcal100g: detail.energyKcal100g ?? '',
        fat100g: detail.fat100g ?? '',
        saturatedFat100g: detail.saturatedFat100g ?? '',
        carbs100g: detail.carbs100g ?? '',
        fiber100g: detail.fiber100g ?? '',
        protein100g: detail.protein100g ?? '',
      }
      nutritionOpen.value = nutrition.value.energyKcal100g !== ''
    } catch (e: unknown) {
      toast.error(apiError(e, 'common.error'))
      emit('update:open', false)
    } finally {
      loading.value = false
    }
  }
)

function labelFor(n: (typeof NUTRIENTS)[number]): string {
  return 'labelKey' in n ? t(n.labelKey) : n.label
}

async function submit() {
  if (!name.value.trim()) return
  saving.value = true
  try {
    const nameTranslations = Object.fromEntries(Object.entries(translations.value).filter(([, v]) => v.trim() !== ''))
    await $fetch(`/api/ingredients/${props.ingredientId}`, {
      method: 'PATCH',
      body: {
        name: name.value.trim(),
        nameTranslations,
        category: category.value.trim() || null,
        nutrition: nutrition.value,
      },
    })
    toast.success(t('recipe.ingredientUpdated'))
    emit('saved')
    emit('update:open', false)
  } catch (e: unknown) {
    toast.error(apiError(e, 'common.error'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal :open="open" :title="t('recipe.editIngredientTitle')" @update:open="(v: boolean) => emit('update:open', v)">
    <template #body>
      <div v-if="loading" class="space-y-3">
        <USkeleton class="h-10 w-full" />
        <USkeleton class="h-10 w-full" />
      </div>
      <div v-else class="space-y-4">
        <UFormField :label="t('recipe.ingredientCanonicalName')" required>
          <UInput v-model="name" maxlength="200" autofocus />
        </UFormField>

        <UFormField :label="t('recipe.ingredientCategory')">
          <USelectMenu
            v-model="category"
            :items="categoryItems"
            value-key="value"
            create-item
            :placeholder="t('recipe.ingredientCategoryPlaceholder')"
            @create="(v: string) => (category = v)"
          />
        </UFormField>

        <div class="space-y-2">
          <p class="text-sm font-medium">{{ t('recipe.ingredientTranslations') }}</p>
          <div class="grid gap-2 sm:grid-cols-2">
            <UFormField v-for="loc in LOCALES" :key="loc" :label="loc.toUpperCase()">
              <UInput v-model="translations[loc]" maxlength="200" />
            </UFormField>
          </div>
        </div>

        <div class="border-t border-default pt-3">
          <UButton
            :label="t('recipe.nutritionOptional')"
            :icon="nutritionOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="nutritionOpen = !nutritionOpen"
          />

          <div v-if="nutritionOpen" class="mt-2 space-y-3">
            <p class="text-xs text-muted">{{ t('recipe.nutritionOptionalHint') }}</p>
            <div class="grid gap-2 sm:grid-cols-2">
              <UFormField
                v-for="n in NUTRIENTS"
                :key="n.key"
                :label="n.unit ? `${labelFor(n)} (${n.unit})` : labelFor(n)"
              >
                <UInput v-model="nutrition[n.key]" type="number" min="0" step="any" inputmode="decimal" />
              </UFormField>
            </div>
            <p class="text-xs text-dimmed italic">{{ t('recipe.nutritionSourceUser') }}</p>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton :label="t('common.cancel')" color="neutral" variant="subtle" @click="emit('update:open', false)" />
        <UButton :label="t('common.save')" :loading="saving" :disabled="loading || !name.trim()" @click="submit" />
      </div>
    </template>
  </UModal>
</template>
