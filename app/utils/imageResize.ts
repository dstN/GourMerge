/**
 * Downscale and re-encode a picked image in the browser, before it is uploaded.
 *
 * ## Why this is client-side
 *
 * The obvious place for this is the server, with `sharp`. It is the wrong place here for
 * two reasons that both come from the deployment (see `.claude/current_state.md` §14):
 * the release is built in CI on `ubuntu-latest` and shipped to Netcup as a tarball of
 * `.output/`, so a native binary would have to match a host we do not control and cannot
 * rebuild on; and Passenger workers on shared hosting have a memory ceiling that decoding
 * a 12-megapixel phone JPEG walks straight into.
 *
 * Doing it here means the server never decodes an image at all — it reads a few dozen
 * header bytes (`server/utils/imageProbe.ts`) and stores the rest verbatim. That removes
 * the entire class of image-decoder vulnerabilities from the server, which is worth more
 * than the convenience.
 *
 * The trade-off is that the client can lie: it can send anything, at any size, and skip
 * this function entirely. That is why the server re-validates format, dimensions and byte
 * length rather than trusting what arrives — this function is a courtesy to the user's
 * data plan, never a security control.
 *
 * `createImageBitmap` over `new Image()`: it decodes off the main thread, so picking a
 * large photo does not freeze the page, and it honours EXIF orientation with
 * `imageOrientation: 'from-image'` — without which portrait phone photos upload sideways.
 */

/** Longest edge after downscaling. Wide enough for a full-bleed card on a 2× display. */
const MAX_EDGE = 1600
/** WebP is ~30% smaller than JPEG at matching quality and is supported everywhere we run. */
const OUTPUT_TYPE = 'image/webp'
const QUALITY = 0.82

export interface ResizedImage {
  blob: Blob
  width: number
  height: number
}

export async function resizeImageForUpload(file: File): Promise<ResizedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Canvas 2D context unavailable')
  }
  // Browsers default to a fast, blocky downscale; these two make a 4000px photo shrink
  // without the aliasing that otherwise shows up on anything with fine texture.
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, OUTPUT_TYPE, QUALITY))
  if (!blob) throw new Error('Image encoding failed')

  return { blob, width, height }
}
