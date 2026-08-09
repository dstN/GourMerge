<script setup lang="ts">
/**
 * CommonAvatarCropper — pan-and-zoom crop to a square, for one picked image.
 *
 * There is no Nuxt UI building block for this, so the interaction is hand-rolled on top
 * of a plain `<img>` and Pointer Events rather than canvas-per-frame drawing: the browser
 * already does the decoding, scaling and EXIF-orientation work for an `<img>` (the CSS
 * spec's `image-orientation: from-image` default), so dragging only ever touches CSS
 * `left`/`top`, and the canvas is touched exactly once, on confirm.
 *
 * ## The viewport *is* the crop — there is no separate mask to keep in sync
 *
 * What is visible inside the round, clipped viewport is pixel-for-pixel what
 * {@link exportBlob} produces, just scaled. Any framing UI (a grid, a bigger canvas with a
 * dimmed surround) would need its own coordinate math kept in step with the pan/zoom state;
 * making the viewport itself the crop removes that second copy of the math entirely.
 *
 * ## Zoom re-clamps the pan; it does not reset it
 *
 * Re-centring on every zoom step is simpler but relocates whatever the user just framed.
 * Clamping keeps the same offset unless it would now show empty space, which is the
 * behaviour people expect from "zoom" — the point under the cursor roughly holds still for
 * small steps, and it only slides for a zoom-out large enough that the old offset genuinely
 * no longer fits.
 */
const props = defineProps<{ file: File }>()
const emit = defineEmits<{ cropped: [blob: Blob]; cancel: [] }>()

const { t } = useI18n()

/** CSS size of the editing viewport. Square, and matches Tailwind's `size-72`. */
const VIEW = 288
/** Longest edge of the exported image. Matches `AVATAR_MAX_EDGE` in the upload endpoint —
 *  exporting any larger would just be immediately downscaled again server-side. */
const EXPORT_EDGE = 512
const MAX_ZOOM = 3

const imgRef = ref<HTMLImageElement | null>(null)
const objectUrl = ref('')
const ready = ref(false)
const natural = reactive({ width: 0, height: 0 })
const zoom = ref(1)
const offset = reactive({ x: 0, y: 0 })

const dragging = ref(false)
const dragStart = { x: 0, y: 0 }
const dragOrigin = { x: 0, y: 0 }

/** Scale at which the image exactly covers the square viewport with no gap, before zoom. */
const coverScale = computed(() => (natural.width ? VIEW / Math.min(natural.width, natural.height) : 1))
const scale = computed(() => coverScale.value * zoom.value)
const displayWidth = computed(() => natural.width * scale.value)
const displayHeight = computed(() => natural.height * scale.value)

function clampAxis(value: number, displaySize: number): number {
  const min = VIEW - displaySize
  return Math.min(0, Math.max(min, value))
}

function clampOffset() {
  offset.x = clampAxis(offset.x, displayWidth.value)
  offset.y = clampAxis(offset.y, displayHeight.value)
}

watch(zoom, () => clampOffset())

watch(
  () => props.file,
  (file) => {
    if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = URL.createObjectURL(file)
    ready.value = false
    zoom.value = 1
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
})

function onImageLoad() {
  const el = imgRef.value
  if (!el) return
  natural.width = el.naturalWidth
  natural.height = el.naturalHeight
  // Centred by default — negative because the image is larger than the viewport on the
  // shorter axis, zero on the axis where it exactly fits.
  offset.x = (VIEW - displayWidth.value) / 2
  offset.y = (VIEW - displayHeight.value) / 2
  ready.value = true
}

function onPointerDown(event: PointerEvent) {
  dragging.value = true
  dragStart.x = event.clientX
  dragStart.y = event.clientY
  dragOrigin.x = offset.x
  dragOrigin.y = offset.y
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return
  offset.x = clampAxis(dragOrigin.x + (event.clientX - dragStart.x), displayWidth.value)
  offset.y = clampAxis(dragOrigin.y + (event.clientY - dragStart.y), displayHeight.value)
}

function onPointerUp() {
  dragging.value = false
}

/**
 * Maps the visible square back to source-image pixels and draws exactly that region —
 * the inverse of the `left/top` + `width/height` used to display it. Because the viewport
 * is square and the scale is uniform on both axes, the source region is square too, so
 * this is always a true 1:1 crop and never a stretch.
 */
async function exportBlob(): Promise<Blob> {
  const el = imgRef.value
  if (!el) throw new Error('Image not loaded')

  const sx = -offset.x / scale.value
  const sy = -offset.y / scale.value
  const sSize = VIEW / scale.value

  const canvas = document.createElement('canvas')
  canvas.width = EXPORT_EDGE
  canvas.height = EXPORT_EDGE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(el, sx, sy, sSize, sSize, 0, 0, EXPORT_EDGE, EXPORT_EDGE)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85))
  if (!blob) throw new Error('Image encoding failed')
  return blob
}

async function confirm() {
  emit('cropped', await exportBlob())
}
</script>

<template>
  <div class="flex flex-col items-center gap-4">
    <div
      class="relative size-72 shrink-0 touch-none select-none overflow-hidden rounded-full border border-default bg-elevated"
      :class="ready && 'cursor-grab active:cursor-grabbing'"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <img
        ref="imgRef"
        :src="objectUrl"
        alt=""
        class="absolute max-w-none"
        :style="{
          width: `${displayWidth}px`,
          height: `${displayHeight}px`,
          left: `${offset.x}px`,
          top: `${offset.y}px`,
          visibility: ready ? 'visible' : 'hidden',
        }"
        @load="onImageLoad"
      />
    </div>

    <div class="flex w-full max-w-72 items-center gap-3">
      <UIcon name="i-lucide-zoom-out" class="size-4 shrink-0 text-dimmed" aria-hidden="true" />
      <USlider v-model="zoom" :min="1" :max="MAX_ZOOM" :step="0.01" :aria-label="t('settings.avatarCropZoom')" />
      <UIcon name="i-lucide-zoom-in" class="size-4 shrink-0 text-dimmed" aria-hidden="true" />
    </div>

    <div class="flex justify-end gap-2 self-end">
      <UButton color="neutral" variant="outline" :label="t('common.cancel')" @click="emit('cancel')" />
      <UButton :label="t('settings.avatarCropApply')" :disabled="!ready" @click="confirm" />
    </div>
  </div>
</template>
