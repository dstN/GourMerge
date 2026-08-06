<script setup lang="ts">
const { t, locale } = useI18n()

interface IngredientOption {
  id: number | null
  name: string
  localeName: string
  category: string | null
  isNew?: boolean
}

const props = defineProps<{
  modelValue: { id: number | null; name: string } | null
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: { id: number | null; name: string }]
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

// ── New-ingredient dialog ────────────────────────────────────
// Choosing "create X" used to emit a row with `id: null`, and the edit page then created
// the master row at commit time from the bare name — no translations, no category, no
// nutrition, and no chance to supply them. It now opens a dialog and the row receives a
// real id, so the ingredient is findable in every locale from the moment it exists.
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
  emit('update:modelValue', { id: option.id, name: option.localeName || option.name })
  query.value = option.localeName || option.name
  options.value = []
  isFocused.value = false
}

function onCreated(created: { id: number; name: string }) {
  emit('update:modelValue', { id: created.id, name: created.name })
  query.value = created.name
}

watch(
  () => props.modelValue,
  (val) => {
    if (val && query.value !== (val.name ?? '')) {
      query.value = val.name ?? ''
    }
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
        </span>
      </button>
    </div>

    <RecipeNewIngredientModal v-model:open="createOpen" :initial-name="pendingName" @created="onCreated" />
  </div>
</template>
