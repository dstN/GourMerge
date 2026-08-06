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
  <!--
    One row, two layouts. Below `sm` the five controls stack, because a single flex row
    squeezed the ingredient name down to about three characters ("Pou", "Kart") — the
    name is the one field you cannot guess from context, so it gets the full width.

      mobile            sm and up
      ⠿ [name    ] ✕    ⠿ [name] [qty] [unit] [notes] ✕
        [qty][unit]
        [notes     ]

    `sm:contents` on the qty/unit wrapper dissolves it at `sm`, so the desktop row stays a
    single flex line with no duplicated markup.
  -->
  <div class="group flex items-start gap-2" :data-tour="`ingredient-row-${index}`">
    <!-- Drag handle -->
    <div class="mt-2.5 cursor-grab text-dimmed transition-colors hover:text-muted shrink-0" aria-hidden="true">
      <UIcon name="i-lucide-grip-vertical" class="size-4" />
    </div>

    <div class="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start">
      <!-- Ingredient name autocomplete -->
      <div class="min-w-0 flex-1">
        <IngredientAutocomplete
          :model-value="{ id: row.ingredientId, name: row.name }"
          @update:model-value="
            (val: { id: number | null; name: string }) => update({ ingredientId: val.id, name: val.name })
          "
        />
      </div>

      <div class="flex gap-2 sm:contents">
        <!-- Quantity -->
        <UInput
          :model-value="row.quantity"
          type="number"
          min="0"
          step="any"
          :placeholder="t('recipe.quantity')"
          class="w-24 shrink-0"
          @update:model-value="(val) => update({ quantity: String(val) })"
        />

        <!-- Unit -->
        <USelect
          :model-value="row.unit"
          :items="unitOptions"
          value-key="value"
          class="flex-1 sm:w-24 sm:flex-none"
          @update:model-value="(val: string) => update({ unit: val as IngredientRowData['unit'] })"
        />
      </div>

      <!--
        Was `hidden sm:block`, which meant notes could be neither read nor written on a
        phone — the data existed and the field to reach it did not.
      -->
      <UInput
        :model-value="row.notes"
        :placeholder="t('recipe.notes')"
        class="sm:w-32 sm:shrink-0"
        @update:model-value="(val) => update({ notes: String(val) })"
      />
    </div>

    <!--
      Reveal-on-hover only from `sm` up. A touch device has no hover, so on a phone this
      button was permanently invisible and an ingredient could not be removed at all.
      `focus-visible` keeps it reachable by keyboard on desktop too.
    -->
    <UButton
      icon="i-lucide-x"
      color="neutral"
      variant="ghost"
      size="sm"
      class="mt-0.5 shrink-0 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
      :aria-label="t('common.delete')"
      @click="emit('remove')"
    />
  </div>
</template>
