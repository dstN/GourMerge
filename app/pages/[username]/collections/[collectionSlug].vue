<script setup lang="ts">
definePageMeta({ middleware: ['validate-recipe-route', 'shell'] })

interface CollectionDetail {
  collection: {
    id: number
    title: string
    slug: string
    description: string | null
    visibility: 'public' | 'private'
    owner: { username: string; displayName: string | null; avatarUrl: string | null }
    isOwner: boolean
    recipeCount: number
  }
  recipes: Array<Record<string, unknown>>
}

const { t } = useI18n()
const route = useRoute()
const username = computed(() => route.params.username as string)
const collectionSlug = computed(() => route.params.collectionSlug as string)

const { data, pending, error } = useFetch<CollectionDetail>(
  () => `/api/collections/by-slug/${username.value}/${collectionSlug.value}`,
  { headers: useRequestHeaders(['cookie']) }
)

const event = useRequestEvent()
if (import.meta.server && event && error.value) {
  setResponseStatus(event, 404)
}

useSeoMeta({
  title: () => (data.value ? `${data.value.collection.title}: GourMerge` : 'GourMerge'),
  description: () => data.value?.collection.description ?? undefined,
})
</script>

<template>
  <CommonPageShell width="wide">
    <div v-if="pending" class="space-y-4">
      <USkeleton class="h-16 w-full rounded-lg" />
      <USkeleton class="h-64 w-full rounded-lg" />
    </div>

    <CommonEmptyState
      v-else-if="error"
      tone="error"
      icon="i-lucide-bookmark-x"
      :title="t('collections.notFound')"
    />

    <template v-else-if="data">
      <div class="flex flex-col gap-2 mb-6">
        <div class="flex items-center gap-2 flex-wrap">
          <h1 class="text-2xl font-bold tracking-tight">{{ data.collection.title }}</h1>
          <UBadge
            v-if="data.collection.visibility === 'private'"
            color="neutral"
            variant="subtle"
            icon="i-lucide-lock"
            :label="t('recipe.private')"
          />
        </div>
        <p class="text-sm text-muted">
          <NuxtLink :to="`/${data.collection.owner.username}`" class="hover:text-default">
            {{ data.collection.owner.displayName || data.collection.owner.username }}
          </NuxtLink>
          · {{ t('collections.recipeCount', { count: data.collection.recipeCount }) }}
        </p>
        <p v-if="data.collection.description" class="text-muted">{{ data.collection.description }}</p>
      </div>

      <CommonEmptyState
        v-if="data.recipes.length === 0"
        icon="i-lucide-book-open"
        :title="t('collections.emptyItems')"
      />
      <div v-else :class="CARD_GRID">
        <RecipeCard v-for="r in data.recipes" :key="r.id as number" :recipe="r as never" />
      </div>
    </template>
  </CommonPageShell>
</template>
