<script setup lang="ts">
/**
 * RecipeImageUpload — pick, preview, describe and replace the one recipe photo.
 *
 * ## It saves immediately, unlike everything else on the edit page
 *
 * The rest of that page is a working copy that only becomes real on commit, and the photo
 * deliberately is not: it is recipe metadata, not part of a snapshot (see the
 * `recipe_images` comment in the schema), so there is nothing for it to be committed
 * *into*. Holding it until commit would also drag a multi-megabyte blob through the
 * `JSON.stringify` dirty-state comparison that page runs on every keystroke.
 *
 * ## It owns its state after the first render, and that is load-bearing
 *
 * The obvious wiring — emit `changed`, have the page `refresh()` — is wrong here. That
 * page derives every metadata field from the fetched recipe through an `immediate`
 * watcher, so a refresh mid-edit would silently reset the title, servings, tags and
 * translations the author had typed but not committed. So the server's response for this
 * one row is applied locally instead, and the page's own data is left alone.
 */
const props = defineProps<{
  recipeId: number
  /** Server state at page load. Owned locally from then on — see the docblock. */
  initialImage: { checksum: string; width: number; height: number; altText: string | null; mimeType: string } | null
}>()

const { t } = useI18n()
const { apiError } = useApiError()
const toast = useAppToast()

type ImageMeta = NonNullable<typeof props.initialImage>

const current = ref<ImageMeta | null>(props.initialImage)
const altText = ref(props.initialImage?.altText ?? '')
const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)

const previewUrl = computed(() =>
  current.value ? `/api/recipes/${props.recipeId}/image?v=${current.value.checksum}` : null
)

/** Mirrors the server's allowlist, so the OS picker does not offer what would 415. */
const ACCEPT = 'image/jpeg,image/png,image/webp'

async function upload(blob: Blob, filename: string) {
  const form = new FormData()
  form.append('file', blob, filename)
  form.append('altText', altText.value)
  current.value = await $fetch<ImageMeta>(`/api/recipes/${props.recipeId}/image`, { method: 'PUT', body: form })
  toast.success(t('recipe.imageSaved'))
}

async function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Cleared immediately: without this, picking the same file twice in a row fires no
  // second `change` event and the upload silently does not happen.
  input.value = ''
  if (!file) return

  busy.value = true
  try {
    // Downscaled and re-encoded in the browser — see app/utils/imageResize.ts for why that
    // is not the server's job, and why the server re-validates regardless.
    const resized = await resizeImageForUpload(file)
    await upload(resized.blob, 'cover.webp')
  } catch (e: unknown) {
    toast.error(apiError(e, 'recipe.imageError'))
  } finally {
    busy.value = false
  }
}

/** Change the description without picking a new file — the common edit after the fact. */
async function saveAltText() {
  const image = current.value
  if (!image) return
  busy.value = true
  try {
    /**
     * The PUT is the only writer of this row, so changing the description means sending
     * the bytes again. Reading them back from our own origin costs one already-cached
     * request and keeps this down to a single, fully-validating write path — a PATCH that
     * could update the description alone would be a second one to keep in step with it.
     */
    const blob = await $fetch<Blob>(`/api/recipes/${props.recipeId}/image?v=${image.checksum}`, {
      responseType: 'blob',
    })
    await upload(blob, 'cover')
  } catch (e: unknown) {
    toast.error(apiError(e, 'recipe.imageError'))
  } finally {
    busy.value = false
  }
}

async function removeImage() {
  busy.value = true
  try {
    await $fetch(`/api/recipes/${props.recipeId}/image`, { method: 'DELETE' })
    current.value = null
    altText.value = ''
    toast.success(t('recipe.imageRemoved'))
  } catch (e: unknown) {
    toast.error(apiError(e, 'recipe.imageError'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="current && previewUrl" class="flex flex-col gap-3 sm:flex-row sm:items-start">
      <img
        :src="previewUrl"
        :alt="altText || t('recipe.imageCaption')"
        :width="current.width"
        :height="current.height"
        class="h-32 w-full shrink-0 rounded-lg border border-default object-cover sm:w-48"
      />
      <div class="min-w-0 flex-1 space-y-2">
        <UFormField :label="t('recipe.imageAlt')" :hint="t('recipe.imageAltHint')">
          <UInput v-model="altText" :placeholder="t('recipe.imageAltPlaceholder')" :maxlength="300" />
        </UFormField>
        <div class="flex flex-wrap gap-2">
          <UButton
            :label="t('common.save')"
            icon="i-lucide-save"
            size="sm"
            color="neutral"
            variant="outline"
            :loading="busy"
            @click="saveAltText"
          />
          <UButton
            :label="t('recipe.imageReplace')"
            icon="i-lucide-image-up"
            size="sm"
            color="neutral"
            variant="outline"
            :loading="busy"
            @click="() => fileInput?.click()"
          />
          <UButton
            :label="t('common.delete')"
            icon="i-lucide-trash-2"
            size="sm"
            color="error"
            variant="outline"
            :loading="busy"
            @click="removeImage"
          />
        </div>
      </div>
    </div>

    <div v-else class="flex flex-wrap items-center gap-3">
      <UButton
        :label="t('recipe.imageUpload')"
        icon="i-lucide-image-plus"
        size="sm"
        color="neutral"
        variant="outline"
        :loading="busy"
        @click="() => fileInput?.click()"
      />
      <p class="text-xs text-dimmed">{{ t('recipe.imageHint') }}</p>
    </div>

    <!-- A native input is the only way to open a file picker. Visually hidden rather than
         `display:none`, so it stays in the accessibility tree and remains reachable by
         keyboard; the buttons above are what everyone else clicks. -->
    <input
      ref="fileInput"
      type="file"
      :accept="ACCEPT"
      class="sr-only"
      :aria-label="t('recipe.imageUpload')"
      @change="onPick"
    />
  </div>
</template>
