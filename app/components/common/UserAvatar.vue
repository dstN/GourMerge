<script setup lang="ts">
/**
 * CommonUserAvatar — the one place a user is drawn as a picture.
 *
 * A user with no uploaded photo gets a generated mark derived from their username, in one
 * of two renderings picked by size (see `server/utils/identiconAvatar.ts` for both):
 *
 * - **`badge`**, from `lg` up — an identicon frame with a scannable QR of the user's
 *   profile URL set into it. Point a phone at it and it opens that profile.
 * - **`mark`**, below `lg` — the identicon alone, coarse and clean.
 *
 * The split is not a nicety. A QR drawn at 32px is not a small QR, it is grey noise: the
 * modules fall under a pixel, so it is neither scannable nor recognisable and fails both
 * halves of its job at once. At header size the job is "tell two users apart at a glance",
 * and a 5×5 identicon does that far better. Both renderings share the seed and the brand
 * ramp, so one person's mark and their badge read as the same identity.
 *
 * **Where the boundary sits, measured rather than guessed.** Rasterising the real SVG and
 * sampling every module: exact from 192px (`2xl`), inside the error-correction budget at
 * 160px, noise below that. So `2xl` is what the profile page uses — the one place a
 * stranger would point a camera — and `lg`/`xl` are the badge shown as decoration.
 *
 * ## Shape
 *
 * Circles, except the scannable badge. DESIGNBOOK §1.3 makes avatars `rounded-full`, and a
 * photo and the identicon mark both take that. The badge cannot: a circular mask cuts off
 * the three finder patterns a decoder uses to locate the symbol, so it is `rounded-md` —
 * the documented §1.3 exception, and the only square avatar in the app.
 */
const props = withDefaults(
  defineProps<{
    username: string
    displayName?: string | null
    avatarUrl?: string | null
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
    /** Wraps the avatar in a link to the profile. Off inside an element that is already a link. */
    link?: boolean
  }>(),
  { displayName: null, avatarUrl: null, size: 'sm', link: false }
)

const { t } = useI18n()

const SIZES = {
  xs: 'size-6',
  sm: 'size-8',
  md: 'size-10',
  lg: 'size-16',
  xl: 'size-24',
  // 192px — the smallest size at which every module of the badge rasterises correctly, so
  // it is the only one that makes the "scan me" promise true.
  '2xl': 'size-48',
} as const

/** Below `lg` the QR would be noise, so those sizes ask for the identicon alone. */
const SCANNABLE_SIZES = new Set(['lg', 'xl', '2xl'])

const label = computed(() => props.displayName || props.username)
const hasPhoto = computed(() => !!props.avatarUrl)
const isBadge = computed(() => !hasPhoto.value && SCANNABLE_SIZES.has(props.size))

const src = computed(() => {
  if (props.avatarUrl) return props.avatarUrl
  const base = `/api/users/${encodeURIComponent(props.username)}/avatar`
  return isBadge.value ? base : `${base}?variant=mark`
})

/**
 * The alt text says what the image *is*. For the badge that is not "avatar of X" — it is a
 * code someone could scan — and a description that hides that is a lie about a plain
 * portrait. For the mark and for a photo, the person's name is the whole of it.
 */
const alt = computed(() => (isBadge.value ? t('profile.qrAvatarAlt', { name: label.value }) : label.value))

const title = computed(() => (isBadge.value ? t('profile.qrAvatarTitle', { name: label.value }) : label.value))

const frameClass = computed(() => [
  'inline-flex shrink-0 items-center justify-center overflow-hidden bg-elevated',
  SIZES[props.size],
  // The one square avatar in the app, and only because rounding it off would delete the
  // finder patterns — see the docblock.
  isBadge.value ? 'rounded-md' : 'rounded-full',
])
</script>

<template>
  <NuxtLink v-if="link" :to="`/${username}`" :class="frameClass">
    <img :src="src" :alt="alt" loading="lazy" decoding="async" class="size-full object-cover" :title="title" />
  </NuxtLink>
  <span v-else :class="frameClass">
    <img :src="src" :alt="alt" loading="lazy" decoding="async" class="size-full object-cover" :title="title" />
  </span>
</template>
