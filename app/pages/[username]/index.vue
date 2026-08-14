<script setup lang="ts">
import type { UserProfile } from '~~/shared/types/recipe'

definePageMeta({ middleware: ['validate-recipe-route', 'shell'] })

const { t } = useI18n()
const route = useRoute()
const { loggedIn } = useUserSession()

const username = computed(() => route.params.username as string)

const {
  data: profile,
  pending,
  error,
} = useFetch<UserProfile>(() => `/api/users/${username.value}`, { headers: useRequestHeaders(['cookie']) })

/**
 * A profile that does not exist must answer 404, not 200 with a friendly page.
 *
 * `/[username]` is the widest route in the app, so every unmatched single-segment path lands
 * here — `/backups`, `/app.js`, `/.my.cnf`, anything. Each of those was returning HTTP 200
 * with this page rendered inside it, which makes every typo an indexable URL and, worse,
 * makes "is this file exposed?" impossible to answer from a status code. Checking whether
 * `/backups` leaks a database dump took reading 36KB of response body to notice it was just
 * this component.
 *
 * `setResponseStatus` rather than `createError`: the status is what was wrong, not the page.
 * A visitor who mistypes a username should still get the styled "profile not found" state
 * below, not the generic error screen — crawlers and scripts get the honest code either way.
 */
const event = useRequestEvent()
if (import.meta.server && event && error.value) {
  setResponseStatus(event, 404)
}

useSeoMeta({
  title: () =>
    profile.value ? `${profile.value.user.displayName || profile.value.user.username}: GourMerge` : 'GourMerge',
})
</script>

<template>
  <CommonPageShell width="wide">
    <div v-if="pending" class="space-y-4">
      <USkeleton class="h-24 w-full rounded-lg" />
      <USkeleton class="h-64 w-full rounded-lg" />
    </div>

    <CommonEmptyState v-else-if="error" tone="error" icon="i-lucide-user-x" :title="t('profile.notFound')" />

    <template v-else-if="profile">
      <!-- Profile header -->
      <div class="flex flex-col items-start gap-6 mb-8 sm:flex-row">
        <div class="flex flex-col items-center gap-2">
          <!-- `2xl` (192px) is the smallest size at which every module of the generated
               badge rasterises correctly — this is the one page a stranger would point a
               camera at, so it is the one place that size is warranted. An uploaded photo
               is just a photo here and takes the same box. -->
          <CommonUserAvatar
            :username="profile.user.username"
            :display-name="profile.user.displayName"
            :avatar-url="profile.user.avatarUrl"
            size="2xl"
          />
          <!-- Only for the generated badge: telling someone their own uploaded photo is
               scannable would be a lie. -->
          <p v-if="!profile.user.avatarUrl" class="flex items-center gap-1 text-xs text-dimmed">
            <UIcon name="i-lucide-scan-line" class="size-3.5 shrink-0" aria-hidden="true" />
            {{ t('profile.qrAvatarScanHint') }}
          </p>
        </div>
        <div class="flex-1 min-w-0">
          <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">
            {{ profile.user.displayName || profile.user.username }}
          </h1>
          <p class="text-muted text-sm mb-2">@{{ profile.user.username }}</p>
          <p v-if="profile.user.bio" class="text-muted">{{ profile.user.bio }}</p>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            :label="t('collections.viewAll')"
            icon="i-lucide-bookmark"
            color="neutral"
            variant="outline"
            size="sm"
            :to="`/${profile.user.username}/collections`"
          />
          <UButton
            v-if="profile.isOwnProfile"
            :label="t('profile.editSettings')"
            icon="i-lucide-settings"
            color="neutral"
            variant="outline"
            size="sm"
            to="/settings"
          />
          <CommonReportButton v-else-if="loggedIn" v-slot="{ open }" target-kind="user" :target-id="profile.user.id">
            <UButton
              :label="t('report.user')"
              icon="i-lucide-flag"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="open"
            />
          </CommonReportButton>
        </div>
      </div>

      <UTabs
        :items="[
          { label: t('profile.recipes'), slot: 'recipes', badge: String(profile.recipes.length) },
          { label: t('profile.starred'), slot: 'starred', badge: String(profile.starredRecipes.length) },
        ]"
        class="w-full"
      >
        <template #recipes>
          <CommonEmptyState
            v-if="profile.recipes.length === 0"
            icon="i-lucide-book-open"
            :title="t('profile.noRecipes')"
            class="mt-4"
          />
          <div v-else :class="[CARD_GRID, 'mt-4']">
            <RecipeCard
              v-for="r in profile.recipes"
              :key="r.id"
              :recipe="{ ...r, owner: { username: profile.user.username } }"
            />
          </div>
        </template>

        <template #starred>
          <CommonEmptyState
            v-if="profile.starredRecipes.length === 0"
            icon="i-lucide-star"
            :title="t('profile.noStarred')"
            class="mt-4"
          />
          <div v-else :class="[CARD_GRID, 'mt-4']">
            <UCard v-for="r in profile.starredRecipes" :key="r.id">
              <h3 class="text-base font-semibold">{{ r.title }}</h3>
              <p class="text-sm text-muted flex items-center gap-1 mt-1">
                <UIcon name="i-lucide-star" class="size-4" aria-hidden="true" /> {{ r.starCount }}
              </p>
            </UCard>
          </div>
        </template>
      </UTabs>
    </template>
  </CommonPageShell>
</template>
