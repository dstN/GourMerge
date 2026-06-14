<script setup lang="ts">
import type { UserProfile } from '~~/shared/types/recipe'

definePageMeta({ middleware: ['validate-recipe-route'] })

const { t } = useI18n()
const route = useRoute()

const username = computed(() => route.params.username as string)

const { data: profile, pending, error } = useFetch<UserProfile>(
  () => `/api/users/${username.value}`,
  { headers: useRequestHeaders(['cookie']) },
)

useSeoMeta({
  title: () => profile.value ? `${profile.value.user.displayName || profile.value.user.username} — GourMerge` : 'GourMerge',
})
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 py-8">
    <div v-if="pending" class="space-y-4">
      <USkeleton class="h-24 w-full rounded-xl" />
      <USkeleton class="h-64 w-full rounded-xl" />
    </div>

    <UCard v-else-if="error" class="text-center py-16">
      <UIcon name="i-lucide-user-x" class="size-16 text-error-500 mx-auto mb-4" />
      <h2 class="text-xl font-semibold">{{ t('profile.notFound') }}</h2>
    </UCard>

    <template v-else-if="profile">
      <!-- Profile header -->
      <div class="flex items-start gap-6 mb-8">
        <div class="w-20 h-20 rounded-full bg-primary-500/10 flex items-center justify-center shrink-0 overflow-hidden">
          <img v-if="profile.user.avatarUrl" :src="profile.user.avatarUrl" :alt="profile.user.username" class="w-full h-full object-cover" >
          <UIcon v-else name="i-lucide-user-circle" class="size-12 text-primary-500" />
        </div>
        <div class="flex-1">
          <h1 class="text-2xl font-bold">{{ profile.user.displayName || profile.user.username }}</h1>
          <p class="text-[var(--ui-text-muted)] text-sm mb-2">@{{ profile.user.username }}</p>
          <p v-if="profile.user.bio" class="text-[var(--ui-text-muted)]">{{ profile.user.bio }}</p>
        </div>
        <UButton
          v-if="profile.isOwnProfile"
          :label="t('profile.editSettings')"
          icon="i-lucide-settings"
          variant="outline"
          color="neutral"
          size="sm"
          to="/settings"
        />
      </div>

      <UTabs
        :items="[
          { label: t('profile.recipes'), slot: 'recipes', badge: String(profile.recipes.length) },
          { label: t('profile.starred'), slot: 'starred', badge: String(profile.starredRecipes.length) },
        ]"
        class="w-full"
      >
        <template #recipes>
          <div v-if="profile.recipes.length === 0" class="text-center py-16 text-[var(--ui-text-muted)]">
            <UIcon name="i-lucide-book-open" class="size-12 mx-auto mb-4 opacity-40" />
            <p>{{ t('profile.noRecipes') }}</p>
          </div>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            <RecipeCard
              v-for="r in profile.recipes"
              :key="r.id"
              :recipe="{ ...r, owner: { username: profile.user.username } }"
            />
          </div>
        </template>

        <template #starred>
          <div v-if="profile.starredRecipes.length === 0" class="text-center py-16 text-[var(--ui-text-muted)]">
            <UIcon name="i-lucide-star" class="size-12 mx-auto mb-4 opacity-40" />
            <p>{{ t('profile.noStarred') }}</p>
          </div>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            <div v-for="r in profile.starredRecipes" :key="r.id">
              <UCard>
                <p class="font-semibold">{{ r.title }}</p>
                <p class="text-sm text-[var(--ui-text-muted)] flex items-center gap-1 mt-1">
                  <UIcon name="i-lucide-star" class="size-3" /> {{ r.starCount }}
                </p>
              </UCard>
            </div>
          </div>
        </template>
      </UTabs>
    </template>
  </div>
</template>
