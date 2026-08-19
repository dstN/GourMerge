<script setup lang="ts">
import type { CreatedIngredient } from '~/components/recipe/NewIngredientModal.vue'

const { t, locale } = useI18n()

interface IngredientOption {
  id: number | null
  name: string
  localeName: string
  category: string | null
  manufacturer?: string | null
  /** Whether the current viewer created this ingredient and may edit/delete it. */
  canEdit?: boolean
  isNew?: boolean
}

const props = defineProps<{
  modelValue: { id: number | null; name: string; canEdit?: boolean } | null
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: { id: number | null; name: string; canEdit?: boolean }]
}>()

const query = ref('')
const options = ref<IngredientOption[]>([])
const loading = ref(false)
const isFocused = ref(false)
const containerRef = ref<HTMLElement | null>(null)
const dropdownPos = ref({ top: '0px', left: '0px', width: '0px' })
let searchTimeout: ReturnType<typeof setTimeout>

const showDropdown = computed(() => isFocused.value && options.value.length > 0)

watch(showDropdown, (val) => {
  if (val && containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect()
    dropdownPos.value = {
      top: `${rect.bottom + 4}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
    }
  }
})

watch(query, (q) => {
  clearTimeout(searchTimeout)
  if (!q || q.length < 1) {
    options.value = []
    return
  }
  loading.value = true
  searchTimeout = setTimeout(async () => {
    try {
      const results = await $fetch<IngredientOption[]>('/api/ingredients', {
        query: { q, locale: locale.value },
      })
      options.value = results

      const exactMatch = results.some(
        (r) => r.name.toLowerCase() === q.toLowerCase() || r.localeName.toLowerCase() === q.toLowerCase()
      )
      if (!exactMatch && q.trim().length > 0) {
        options.value = [...results, { id: null, name: q.trim(), localeName: q.trim(), category: null, isNew: true }]
      }
    } catch {
      options.value = []
    } finally {
      loading.value = false
    }
  }, 250)
})

// Opens a dialog to create the master ingredient row with a real id (translations, category,
// nutrition). Required before the row can be committed — a recipe can't be saved with an
// ingredient that only has a typed name and no id (see edit.vue's commitChanges validation).
const createOpen = ref(false)
const pendingName = ref('')

function onSelect(option: IngredientOption) {
  if (option.isNew) {
    pendingName.value = option.name
    createOpen.value = true
    options.value = []
    isFocused.value = false
    return
  }
  emit('update:modelValue', { id: option.id, name: option.localeName || option.name, canEdit: option.canEdit })
  query.value = option.localeName || option.name
  options.value = []
  isFocused.value = false
}

// Typed by the modal's own CreatedIngredient contract, not an inline structural subset, so a
// payload change here gets caught by the type checker.
function onCreated(created: CreatedIngredient) {
  // Always true: nobody but the creator can reach this callback for this ingredient.
  emit('update:modelValue', { id: created.id, name: created.name, canEdit: true })
  query.value = created.name
}

// Keyed on id+name (not the modelValue object itself) so this only resyncs `query` when the
// committed ingredient actually changes — e.g. row reset or a different ingredient selected —
// not on every sibling-field edit (quantity/unit/notes), which recreates the object but leaves
// id/name untouched and would otherwise stomp an in-progress, not-yet-created ingredient name.
watch(
  () => (props.modelValue ? `${props.modelValue.id ?? ''} ${props.modelValue.name ?? ''}` : null),
  () => {
    if (props.modelValue) query.value = props.modelValue.name ?? ''
  },
  { immediate: true }
)
</script>

<template>
  <div ref="containerRef" class="relative">
    <UInput
      v-model="query"
      :placeholder="placeholder ?? t('recipe.ingredientName')"
      :loading="loading"
      trailing-icon="i-lucide-search"
      @focus="isFocused = true"
      @blur="isFocused = false"
    />
    <div
      v-if="showDropdown"
      class="fixed z-[200] bg-default border border-default rounded-lg shadow-lg max-h-48 overflow-y-auto"
      :style="dropdownPos"
    >
      <button
        v-for="option in options"
        :key="option.id ?? `new-${option.name}`"
        type="button"
        class="w-full text-left px-3 py-2 text-sm hover:bg-elevated transition-colors"
        @mousedown.prevent="onSelect(option)"
      >
        <span v-if="option.isNew" class="flex items-center gap-1.5 text-primary">
          <UIcon name="i-lucide-plus-circle" class="size-4 shrink-0" />
          {{ t('recipe.createIngredient', { name: option.localeName }) }}
        </span>
        <span v-else class="flex items-center gap-2">
          <span>{{ option.localeName }}</span>
          <UBadge v-if="option.category" size="xs" variant="soft" color="neutral">{{ option.category }}</UBadge>
          <UBadge v-if="option.manufacturer" size="xs" variant="soft" color="neutral">{{ option.manufacturer }}</UBadge>
        </span>
      </button>
    </div>

    <RecipeNewIngredientModal v-model:open="createOpen" :initial-name="pendingName" @created="onCreated" />
  </div>
</template>
