<script setup lang="ts">
/**
 * CollectionSaveModal — "save this recipe to a collection" picker.
 *
 * Lists the viewer's own collections as checkboxes reflecting current membership;
 * toggling one fires the add/remove endpoint immediately (optimistic, same posture as the
 * star button). An inline "+ new collection" row creates then adds in one flow.
 */
const props = defineProps<{
  open: boolean
  recipeId: number
}>()

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

interface MyCollection {
  id: number
  title: string
  slug: string
  visibility: 'public' | 'private'
  containsRecipe: boolean
}

const { t } = useI18n()
const toast = useAppToast()
const { apiError } = useApiError()

const { data, refresh } = useFetch<MyCollection[]>('/api/collections/mine', {
  query: { recipeId: props.recipeId },
  immediate: false,
})

watch(
  () => props.open,
  (open) => {
    if (open) refresh()
  }
)

const busyId = ref<number | null>(null)
const newTitle = ref('')
const creating = ref(false)

async function toggle(collection: MyCollection) {
  busyId.value = collection.id
  try {
    if (collection.containsRecipe) {
      await $fetch(`/api/collections/${collection.id}/recipes/${props.recipeId}`, { method: 'DELETE' })
    } else {
      await $fetch(`/api/collections/${collection.id}/recipes`, { method: 'POST', body: { recipeId: props.recipeId } })
    }
    collection.containsRecipe = !collection.containsRecipe
  } catch (e) {
    toast.error(apiError(e))
  } finally {
    busyId.value = null
  }
}

async function createAndAdd() {
  if (!newTitle.value.trim()) return
  creating.value = true
  try {
    const created = await $fetch<{ id: number; slug: string }>('/api/collections', {
      method: 'POST',
      body: { title: newTitle.value.trim() },
    })
    await $fetch(`/api/collections/${created.id}/recipes`, { method: 'POST', body: { recipeId: props.recipeId } })
    newTitle.value = ''
    await refresh()
  } catch (e) {
    toast.error(apiError(e))
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <UModal :open="open" :title="t('collections.saveTitle')" @update:open="(v: boolean) => emit('update:open', v)">
    <template #body>
      <div class="space-y-3">
        <ul v-if="data && data.length > 0" class="space-y-2">
          <li v-for="c in data" :key="c.id" class="flex items-center gap-2">
            <UCheckbox
              :model-value="c.containsRecipe"
              :disabled="busyId === c.id"
              @update:model-value="() => toggle(c)"
            />
            <span class="flex-1 text-sm">{{ c.title }}</span>
            <UIcon v-if="c.visibility === 'private'" name="i-lucide-lock" class="size-3.5 text-dimmed" aria-hidden="true" />
          </li>
        </ul>
        <p v-else class="text-sm text-muted">{{ t('collections.noneYet') }}</p>

        <form class="flex items-end gap-2 border-t border-default pt-3" @submit.prevent="createAndAdd">
          <UFormField :label="t('collections.newTitleLabel')" class="flex-1">
            <UInput v-model="newTitle" maxlength="300" :placeholder="t('collections.newTitlePlaceholder')" />
          </UFormField>
          <UButton
            type="submit"
            icon="i-lucide-plus"
            :label="t('collections.create')"
            :loading="creating"
            :disabled="!newTitle.trim()"
          />
        </form>
      </div>
    </template>
  </UModal>
</template>
