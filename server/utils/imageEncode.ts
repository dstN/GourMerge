/**
 * Re-encode an accepted upload to WebP, server-side, for storage minimisation.
 *
 * ## This reverses an earlier decision, on purpose, and the cost is real
 *
 * The upload path was built so the server **never decodes an image**: the browser
 * downsizes and re-encodes, and `imageProbe.ts` reads only the file header. That removed
 * the whole class of image-decoder vulnerabilities from a Passenger worker and avoided a
 * native binary that has to match a host we cannot rebuild on. Decoding here gives that up
 * in exchange for bytes on disk, which is the trade the owner asked for.
 *
 * Three things keep it from being a bad trade:
 *
 * 1. **It fails open.** If `sharp` cannot be loaded or throws for any reason, the caller
 *    gets the original bytes back with `recompressed: false`. The upload still works; only
 *    the extra compression is lost. The alternative — a 500 — would mean the feature stops
 *    working entirely on a host we cannot test against until it is live.
 * 2. **`limitInputPixels`.** A 2 MB file can be a 30 000 × 30 000 PNG that decodes to
 *    several gigabytes: the "decompression bomb" that byte-size caps do nothing about.
 *    libvips refuses above the limit instead of allocating.
 * 3. **The header check still runs first.** `probeImage()` has already rejected anything
 *    that is not a JPEG/PNG/WebP and anything outside the dimension bounds, so sharp is only
 *    ever handed bytes we have already looked at.
 *
 * ## Why it may return the input unchanged even when it worked
 *
 * The browser has usually already produced a WebP. Re-encoding that is a second lossy pass,
 * and on a well-compressed input it can come out *larger*. So the result is only kept when
 * it is actually smaller — "compress for storage" is a claim about the stored size, not
 * about having run a compressor.
 */
import type { ProbedImage } from './imageProbe'

/** Longest edge of the stored image. Matches what the browser uploader targets. */
const MAX_EDGE = 1600
/** WebP quality. 80 is the usual sweet spot; above it the file grows faster than it improves. */
const QUALITY = 80
/**
 * Decoded-pixel ceiling — ~40 megapixels, comfortably above any phone camera and far below
 * what would exhaust a worker. This is the guard a byte cap cannot provide.
 */
const MAX_INPUT_PIXELS = 40_000_000

export interface EncodedImage {
  data: Buffer
  mimeType: string
  width: number
  height: number
  /** False when the original bytes were kept — sharp was unavailable, failed, or lost. */
  recompressed: boolean
}

export interface EncodeOptions {
  /** Longest edge after downscaling. Defaults to the recipe-photo value, {@link MAX_EDGE}. */
  maxEdge?: number
  /** WebP quality, 0–100. Defaults to {@link QUALITY}. */
  quality?: number
}

/**
 * True when server-side re-encoding is actually available in this process.
 *
 * Exported for `/api/health`: a fail-open that nobody can observe is indistinguishable from
 * a feature that works, and the whole point of failing open is that it happens quietly.
 */
export async function imageEncoderAvailable(): Promise<boolean> {
  try {
    await import('sharp')
    return true
  } catch {
    return false
  }
}

export async function reencodeToWebp(
  input: Buffer,
  probed: ProbedImage,
  options: EncodeOptions = {}
): Promise<EncodedImage> {
  const maxEdge = options.maxEdge ?? MAX_EDGE
  const quality = options.quality ?? QUALITY

  const untouched: EncodedImage = {
    data: input,
    mimeType: probed.mimeType,
    width: probed.width,
    height: probed.height,
    recompressed: false,
  }

  try {
    /**
     * Imported lazily, and that is deliberate: a top-level import would make the whole
     * module graph fail to load if the native binary is missing, taking the upload endpoint
     * — and anything else that imports this file — down with it.
     */
    const { default: sharp } = await import('sharp')

    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      // EXIF orientation, applied before the resize. Without it a portrait phone photo is
      // stored sideways — the browser uploader handles this too, but a direct API caller
      // does not, and this path exists precisely for the callers that skip the browser.
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer({ resolveWithObject: true })

    // Only keep it if it actually helped — see the docblock.
    if (data.length >= input.length && probed.mimeType === 'image/webp') return untouched

    return { data, mimeType: 'image/webp', width: info.width, height: info.height, recompressed: true }
  } catch {
    // Deliberately swallowed. The caller stores what the client sent, which has already
    // passed the format, dimension and size checks.
    return untouched
  }
}
