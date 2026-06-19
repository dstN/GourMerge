<script setup lang="ts">
import IngredientAutocomplete from '~/components/recipe/IngredientAutocomplete.vue'

const { t } = useI18n()

export interface IngredientRowData {
  /** null = new ingredient not yet persisted to master table */
  ingredientId: number | null
  name: string
  quantity: string
  unit: 'g' | 'ml' | 'piece' | 'pinch' | 'tsp' | 'tbsp'
  notes: string
  sortOrder: number
}

const props = defineProps<{
  modelValue: IngredientRowData
  index: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: IngredientRowData]
  remove: []
}>()

const row = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const unitOptions = [
  { label: 'g', value: 'g' },
  { label: 'ml', value: 'ml' },
  { label: t('recipe.unitPiece'), value: 'piece' },
  { label: t('recipe.unitPinch'), value: 'pinch' },
  { label: 'tsp', value: 'tsp' },
  { label: 'tbsp', value: 'tbsp' },
]

function update(patch: Partial<IngredientRowData>) {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}
</script>

<template>
  <div class="flex items-start gap-2 group" :data-tour="`ingredient-row-${index}`">
    <!-- Drag handle -->
    <div class="mt-2.5 cursor-grab text-neutral-400 hover:text-neutral-600 shrink-0" aria-hidden="true">
      <UIcon name="i-lucide-grip-vertical" class="size-4" />
    </div>

    <!-- Ingredient name autocomplete -->
    <div class="flex-1 min-w-0">
      <IngredientAutocomplete
        :model-value="{ id: row.ingredientId, name: row.name }"
        @update:model-value="
          (val: { id: number | null; name: string }) => update({ ingredientId: val.id, name: val.name })
        "
      />
    </div>

    <!-- Quantity -->
    <UInput
      :model-value="row.quantity"
      type="number"
      min="0"
      step="any"
      :placeholder="t('recipe.quantity')"
      class="w-20 shrink-0"
      @update:model-value="(val) => update({ quantity: String(val) })"
    />

    <!-- Unit -->
    <USelect
      :model-value="row.unit"
      :items="unitOptions"
      value-key="value"
      class="w-24 shrink-0"
      @update:model-value="(val: string) => update({ unit: val as IngredientRowData['unit'] })"
    />

    <!-- Notes (optional) -->
    <UInput
      :model-value="row.notes"
      :placeholder="t('recipe.notes')"
      class="w-32 shrink-0 hidden sm:block"
      @update:model-value="(val) => update({ notes: String(val) })"
    />

    <!-- Remove -->
    <UButton
      icon="i-lucide-x"
      color="neutral"
      variant="ghost"
      size="sm"
      class="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
      :aria-label="t('common.delete')"
      @click="emit('remove')"
    />
  </div>
</template>
