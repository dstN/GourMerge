<script setup lang="ts">
import type { RecipeDetail, GourmergeRequestListItem } from '~~/shared/types/recipe'

definePageMeta({ middleware: ['validate-recipe-route', 'shell'] })

const { t } = useI18n()
const route = useRoute()
const { loggedIn } = useUserSession()

/** Needed as a value, not a tag name, to hand to `<UCard :as>` — see the template. */
const NuxtLink = resolveComponent('NuxtLink')

const username = computed(() => route.params.username as string)
const slug = computed(() => route.params.slug as string)
const recipeUrl = computed(() => `/${username.value}/${slug.value}`)

const { data: recipe } = useFetch<RecipeDetail>(() => `/api/recipes/by-slug/${username.value}/${slug.value}`, {
  headers: useRequestHeaders(['cookie']),
})

const statusFilter = ref('open')

const recipeId = computed(() => recipe.value?.id ?? 0)

const { data: requests, pending } = useFetch<GourmergeRequestListItem[]>(
  () => `/api/recipes/${recipeId.value}/gourmerge-requests`,
  {
    headers: useRequestHeaders(['cookie']),
    query: computed(() => ({ status: statusFilter.value })),
    watch: [statusFilter, recipeId],
  }
)

useSeoMeta({
  title: () => (recipe.value ? `${t('gourmergeRequest.titlePlural')} — ${recipe.value.title}` : 'GourMerge'),
})
</script>

<template>
  <CommonPageShell width="content">
    <CommonPageHeader
      :title="t('gourmergeRequest.titlePlural')"
      icon="i-lucide-git-pull-request"
      :back-to="recipeUrl"
      :back-label="recipe?.title"
    >
      <template #actions>
        <UButton
          v-if="loggedIn && recipe"
          :label="t('gourmergeRequest.new')"
          icon="i-lucide-plus"
          size="lg"
          :to="`${recipeUrl}/gourmerge-requests/new`"
        />
      </template>
    </CommonPageHeader>

    <!-- Status filter — a toggle row (DESIGNBOOK §2). Colour comes from the
         shared GMR_STATUS_COLOR map so it matches the badge on each row and on
         the detail page. -->
    <div class="flex flex-wrap gap-2 mb-4">
      <UButton
        v-for="s in ['open', 'closed', 'merged']"
        :key="s"
        :label="t(`gourmergeRequest.${s}`)"
        size="sm"
        :color="statusFilter === s ? GMR_STATUS_COLOR[s] : 'neutral'"
        :variant="statusFilter === s ? 'solid' : 'outline'"
        :aria-pressed="statusFilter === s"
        @click="
          () => {
            statusFilter = s
          }
        "
      />
    </div>

    <div v-if="pending" class="space-y-3">
      <USkeleton v-for="i in 3" :key="i" class="h-20 rounded-lg" />
    </div>

    <CommonEmptyState
      v-else-if="!requests?.length"
      icon="i-lucide-git-pull-request"
      :title="t('gourmergeRequest.noRequests')"
    />

    <div v-else class="space-y-3">
      <!--
        `:as="NuxtLink"` is load-bearing. This was `<UCard :to="…">`, and UCard declares no
        `to` prop — it takes `as`, `title`, `description`, `variant`, `class`, `ui`. The
        attribute fell through to a plain <div>, so nothing navigated, while `cursor-pointer`
        and the hover border made every row look clickable. A request could be listed and
        never opened, which meant it could never be merged or closed either.

        Rendering the root AS a link also makes the row a real anchor: keyboard focusable,
        middle-clickable, openable in a new tab — none of which a click handler on a div
        would have given us.
      -->
      <UCard
        v-for="r in requests"
        :key="r.id"
        :as="NuxtLink"
        :to="`${recipeUrl}/gourmerge-requests/${r.id}`"
        class="block transition-colors hover:border-primary-500/50"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <UBadge :color="GMR_STATUS_COLOR[r.status]" :label="t(`gourmergeRequest.${r.status}`)" />
              <span class="font-semibold truncate">{{ r.title }}</span>
            </div>
            <p class="text-sm text-muted">
              {{ t('gourmergeRequest.by', { author: r.authorDisplayName || r.authorUsername }) }}
            </p>
          </div>
          <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-muted" aria-hidden="true" />
        </div>
      </UCard>
    </div>
  </CommonPageShell>
</template>
