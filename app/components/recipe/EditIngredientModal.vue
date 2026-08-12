<script setup lang="ts">
/**
 * EditIngredientModal — lets the ingredient's own creator fix a name, category or nutrition
 * value after the fact. The server enforces `created_by === viewer` independently
 * (`PATCH` / `DELETE /api/ingredients/:id`); this component trusts `canEdit` from the caller
 * only to decide whether to show the trigger at all, same as any other owner-only control.
 *
 * Mirrors `NewIngredientModal.vue`'s field set on purpose — editing is the same macro and
 * micro fields and the same four locale names, just pre-filled and PATCHed instead of POSTed.
 */
import type { MacroKey } from '~/composables/useIngredientNutrientFields'

const { t } = useI18n()
const { apiError } = useApiError()
const toast = useAppToast()
const { MACRO_FIELDS, labelFor, VITAMIN_KEYS, MINERAL_KEYS, MICRO_LABELS, unitFromMicroKey } =
  useIngredientNutrientFields()

const LOCALES = ['de', 'en', 'fr', 'it'] as const
type Locale = (typeof LOCALES)[number]

interface IngredientDetail {
  id: number
  name: string
  nameTranslations: Record<string, string> | null
  category: string | null
  manufacturer: string | null
  energyKcal100g: string | null
  protein100g: string | null
  carbs100g: string | null
  fat100g: string | null
  fiber100g: string | null
  saturatedFat100g: string | null
  micros: Record<string, number> | null
}

const props = defineProps<{ open: boolean; ingredientId: number }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  saved: [updated: { id: number; name: string; category: string | null }]
  deleted: [id: number]
}>()

const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const deleteConfirmOpen = ref(false)
const name = ref('')
const translations = ref<Record<Locale, string>>({ de: '', en: '', fr: '', it: '' })
const category = ref('')
const manufacturer = ref('')
const nutritionOpen = ref(false)
const microsOpen = ref(false)
const nutrition = ref<Record<MacroKey, string>>({
  energyKcal100g: '',
  fat100g: '',
  saturatedFat100g: '',
  carbs100g: '',
  fiber100g: '',
  protein100g: '',
})
const micros = ref(emptyMicros())

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
      manufacturer.value = detail.manufacturer ?? ''
      nutrition.value = {
        energyKcal100g: detail.energyKcal100g ?? '',
        fat100g: detail.fat100g ?? '',
        saturatedFat100g: detail.saturatedFat100g ?? '',
        carbs100g: detail.carbs100g ?? '',
        fiber100g: detail.fiber100g ?? '',
        protein100g: detail.protein100g ?? '',
      }
      const storedMicros = emptyMicros()
      for (const [k, v] of Object.entries(detail.micros ?? {})) {
        if (k in storedMicros) storedMicros[k as keyof typeof storedMicros] = String(v)
      }
      micros.value = storedMicros
      nutritionOpen.value = nutrition.value.energyKcal100g !== ''
      microsOpen.value = Object.values(storedMicros).some((v) => v !== '')
    } catch (e: unknown) {
      toast.error(apiError(e, 'common.error'))
      emit('update:open', false)
    } finally {
      loading.value = false
    }
  }
)

async function submit() {
  if (!name.value.trim()) return
  saving.value = true
  try {
    const nameTranslations = droppedEmpty(translations.value)
    await $fetch(`/api/ingredients/${props.ingredientId}`, {
      method: 'PATCH',
      body: {
        name: name.value.trim(),
        nameTranslations,
        category: category.value.trim() || null,
        manufacturer: manufacturer.value.trim() || null,
        nutrition: { ...nutrition.value, micros: micros.value },
      },
    })
    toast.success(t('recipe.ingredientUpdated'))
    emit('saved', { id: props.ingredientId, name: name.value.trim(), category: category.value.trim() || null })
    emit('update:open', false)
  } catch (e: unknown) {
    toast.error(apiError(e, 'common.error'))
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  deleting.value = true
  try {
    await $fetch(`/api/ingredients/${props.ingredientId}`, { method: 'DELETE' })
    toast.success(t('recipe.ingredientDeleted'))
    deleteConfirmOpen.value = false
    emit('deleted', props.ingredientId)
    emit('update:open', false)
  } catch (e: unknown) {
    toast.error(apiError(e, 'common.error'))
  } finally {
    deleting.value = false
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

        <UFormField :label="t('recipe.ingredientManufacturer')">
          <UInput v-model="manufacturer" maxlength="200" :placeholder="t('recipe.ingredientManufacturerPlaceholder')" />
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
              <!-- `type="text"` + `inputmode="decimal"`, not `type="number"`: a native number
                   input rejects a comma in most locales, and German nutrition labels are
                   written with one ("12,5"). The server (`decimalSchema`) already accepts
                   either separator — the input just has to let people type it. -->
              <UFormField
                v-for="n in MACRO_FIELDS"
                :key="n.key"
                :label="n.unit ? `${labelFor(n)} (${n.unit})` : labelFor(n)"
              >
                <UInput
                  :model-value="nutrition[n.key]"
                  type="text"
                  inputmode="decimal"
                  @update:model-value="(v: string | number) => (nutrition[n.key] = String(v))"
                />
              </UFormField>
            </div>
            <p class="text-xs text-dimmed italic">{{ t('recipe.nutritionSourceUser') }}</p>
          </div>
        </div>

        <div class="border-t border-default pt-3">
          <UButton
            :label="t('nutrition.showMicros')"
            :icon="microsOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="microsOpen = !microsOpen"
          />

          <div v-if="microsOpen" class="mt-2 space-y-3">
            <div>
              <p class="text-xs font-medium text-muted">{{ t('nutrition.vitamins') }}</p>
              <div class="mt-1 grid gap-2 sm:grid-cols-2">
                <UFormField v-for="k in VITAMIN_KEYS" :key="k" :label="`${MICRO_LABELS[k]} (${unitFromMicroKey(k)})`">
                  <UInput
                    :model-value="micros[k]"
                    type="text"
                    inputmode="decimal"
                    @update:model-value="(v: string | number) => (micros[k] = String(v))"
                  />
                </UFormField>
              </div>
            </div>
            <div>
              <p class="text-xs font-medium text-muted">{{ t('nutrition.minerals') }}</p>
              <div class="mt-1 grid gap-2 sm:grid-cols-2">
                <UFormField v-for="k in MINERAL_KEYS" :key="k" :label="`${MICRO_LABELS[k]} (${unitFromMicroKey(k)})`">
                  <UInput
                    :model-value="micros[k]"
                    type="text"
                    inputmode="decimal"
                    @update:model-value="(v: string | number) => (micros[k] = String(v))"
                  />
                </UFormField>
              </div>
            </div>
            <p class="text-xs text-dimmed italic">{{ t('recipe.nutritionSourceUser') }}</p>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <UButton
          :label="t('common.delete')"
          color="error"
          variant="ghost"
          :disabled="loading"
          @click="deleteConfirmOpen = true"
        />
        <div class="flex gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="subtle" @click="emit('update:open', false)" />
          <UButton :label="t('common.save')" :loading="saving" :disabled="loading || !name.trim()" @click="submit" />
        </div>
      </div>
    </template>
  </UModal>

  <!-- Nested confirm, not window.confirm — DESIGNBOOK §6.4. -->
  <UModal
    :open="deleteConfirmOpen"
    :title="t('recipe.deleteIngredientTitle')"
    @update:open="(v: boolean) => (deleteConfirmOpen = v)"
  >
    <template #body>
      <p class="text-muted">{{ t('recipe.deleteIngredientConfirm') }}</p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="deleteConfirmOpen = false" />
        <UButton :label="t('common.delete')" color="error" :loading="deleting" @click="confirmDelete" />
      </div>
    </template>
  </UModal>
</template>
