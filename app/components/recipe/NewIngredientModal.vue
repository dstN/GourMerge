<script setup lang="ts">
/**
 * NewIngredientModal — collects the details for an ingredient that does not exist yet.
 *
 * Before this, choosing "create X" in the autocomplete created a master-table row from a
 * bare name: no translations, no category, no nutrition. The API had always accepted all
 * three; nothing ever asked for them. The consequences were quiet but real — the
 * ingredient was findable only in the language it happened to be typed in, and it dragged
 * every recipe's nutrition totals toward zero while being counted as "covered enough" to
 * not stand out.
 *
 * Creation happens on confirm here rather than at commit time, so the row exists with its
 * data attached and the caller gets a real id immediately. It also makes creating an
 * ingredient a deliberate act instead of a side effect of saving — which is how a dev
 * database ends up with dozens of rows called `Butter 1785947886683`.
 */
import type { MacroKey } from '~/composables/useIngredientNutrientFields'

const { t, locale } = useI18n()
const { apiError } = useApiError()
const toast = useAppToast()
const { labelFor, VITAMIN_KEYS, MINERAL_KEYS, MICRO_LABELS, unitFromMicroKey } = useIngredientNutrientFields()

const LOCALES = ['de', 'en', 'fr', 'it'] as const
type Locale = (typeof LOCALES)[number]

export interface CreatedIngredient {
  id: number
  name: string
  category: string | null
  hasNutrition: boolean
}

const props = defineProps<{
  open: boolean
  /** What the user typed in the autocomplete — pre-fills the canonical name and own locale. */
  initialName: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  created: [value: CreatedIngredient]
}>()

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
  sugars100g: '',
  fiber100g: '',
  protein100g: '',
  salt100g: '',
})
const micros = ref(emptyMicros())
const gramsPerPiece = ref('')
const saving = ref(false)

const { data: categories } = await useFetch<string[]>('/api/ingredients/categories', { lazy: true, server: false })

const categoryItems = computed(() => (categories.value ?? []).map((c) => ({ label: c, value: c })))

// Reset on each open, and seed the typed text into both the canonical name and the
// language the author is working in — that is the one translation we can be sure of.
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    name.value = props.initialName
    translations.value = { de: '', en: '', fr: '', it: '' }
    translations.value[locale.value as Locale] = props.initialName
    category.value = ''
    manufacturer.value = ''
    nutritionOpen.value = false
    microsOpen.value = false
    for (const k of Object.keys(nutrition.value) as MacroKey[]) nutrition.value[k] = ''
    micros.value = emptyMicros()
    gramsPerPiece.value = ''
  },
  { immediate: true }
)

async function submit() {
  if (!name.value.trim()) return
  saving.value = true
  try {
    // Empty strings are dropped rather than sent: the API stores a nutrition row only
    // when an energy value is present, and `{}` would otherwise look like real data.
    const nameTranslations = droppedEmpty(translations.value)
    const macroPayload = droppedEmpty(nutrition.value)
    const microsPayload = droppedEmpty(micros.value)
    const nutritionPayload = {
      ...macroPayload,
      ...(gramsPerPiece.value.trim() ? { gramsPerPiece: gramsPerPiece.value.trim() } : {}),
      ...(Object.keys(microsPayload).length ? { micros: microsPayload } : {}),
    }

    const created = await $fetch<CreatedIngredient>('/api/ingredients', {
      method: 'POST',
      body: {
        name: name.value.trim(),
        ...(Object.keys(nameTranslations).length ? { nameTranslations } : {}),
        ...(category.value.trim() ? { category: category.value.trim() } : {}),
        ...(manufacturer.value.trim() ? { manufacturer: manufacturer.value.trim() } : {}),
        ...(Object.keys(nutritionPayload).length ? { nutrition: nutritionPayload } : {}),
      },
    })
    toast.success(t('recipe.ingredientCreated'))
    emit('created', created)
    emit('update:open', false)
  } catch (e: unknown) {
    toast.error(apiError(e, 'common.error'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    :open="open"
    :title="t('recipe.newIngredientTitle')"
    :description="t('recipe.newIngredientHint')"
    @update:open="(v: boolean) => emit('update:open', v)"
  >
    <template #body>
      <div class="space-y-4">
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

        <!-- Collapsed by default: most people will not have these numbers to hand, and an
             open block of empty fields reads as required. -->
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

            <UFormField :label="t('recipe.gramsPerPiece')" :hint="t('recipe.gramsPerPieceHint')">
              <UInput
                :model-value="gramsPerPiece"
                type="text"
                inputmode="numeric"
                class="sm:w-48"
                @update:model-value="(v: string | number) => (gramsPerPiece = String(v))"
              />
            </UFormField>

            <p class="text-xs text-dimmed italic">{{ t('recipe.nutritionSourceUser') }}</p>
          </div>
        </div>

        <!-- Same catalog the Swiss BLV import fills in for its own foods (see
             `shared/utils/ingredientMicros.ts`), so a self-reported value lands in the exact
             same field a recipe's micronutrient totals already read from. -->
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
      <div class="flex w-full justify-end gap-2">
        <UButton :label="t('common.cancel')" color="neutral" variant="subtle" @click="emit('update:open', false)" />
        <UButton :label="t('common.create')" :loading="saving" :disabled="!name.trim()" @click="submit" />
      </div>
    </template>
  </UModal>
</template>
