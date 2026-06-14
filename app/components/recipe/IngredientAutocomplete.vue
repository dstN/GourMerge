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
let searchTimeout: ReturnType<typeof setTimeout>

// Debounced search
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

      // Append "Create: <query>" option if no exact match
      const exactMatch = results.some(
        (r) => r.name.toLowerCase() === q.toLowerCase() || r.localeName.toLowerCase() === q.toLowerCase()
      )
      if (!exactMatch && q.trim().length > 0) {
        options.value = [
          ...results,
          { id: null, name: q.trim(), localeName: q.trim(), category: null, isNew: true },
        ]
      }
    } catch {
      options.value = []
    } finally {
      loading.value = false
    }
  }, 250)
})

function onSelect(option: IngredientOption | null) {
  if (!option) return
  emit('update:modelValue', { id: option.id, name: option.localeName || option.name })
  query.value = option.localeName || option.name
}

// Sync display value when modelValue changes externally
watch(() => props.modelValue, (val) => {
  if (val && query.value !== (val.name ?? '')) {
    query.value = val.name ?? ''
  }
}, { immediate: true })
</script>

<template>
  <UInputMenu
    v-model="query"
    :items="options"
    option-attribute="localeName"
    value-attribute="id"
    :loading="loading"
    :placeholder="placeholder ?? t('recipe.ingredientName')"
    trailing-icon="i-lucide-search"
    @update:model-value="() => {}"
    @change="(val: any) => {
      const opt = options.find(o => o.id === val || o.localeName === val || o.name === val)
      if (opt) onSelect(opt)
    }"
  >
    <template #item="{ item }">
      <span v-if="item.isNew" class="flex items-center gap-1.5 text-primary-500">
        <UIcon name="i-lucide-plus-circle" class="size-4 shrink-0" />
        {{ t('recipe.createIngredient', { name: item.localeName }) }}
      </span>
      <span v-else class="flex items-center gap-2">
        <span>{{ item.localeName }}</span>
        <UBadge v-if="item.category" size="xs" variant="soft" color="neutral">{{ item.category }}</UBadge>
      </span>
    </template>
  </UInputMenu>
</template>
