/**
 * Identify and measure an uploaded image from its own bytes.
 *
 * ## Why we do not trust the upload's Content-Type
 *
 * The part header of a multipart upload is attacker-controlled text. A file announced as
 * `image/png` that actually starts with `<svg onload=…>` and gets stored, then served
 * back with the announced type, is stored XSS on our own origin — `img-src 'self'` in the
 * CSP does nothing about it, because the browser never treats the response as an image.
 * So the type we store and later send is derived here, from the magic bytes, and the
 * client's claim is discarded.
 *
 * SVG is rejected for the same reason and cannot be added later "just for logos": it is a
 * document format with script execution, not an image format.
 *
 * ## Why the dimensions are parsed rather than trusted
 *
 * They are stored so the recipe page can reserve the exact aspect ratio before the image
 * loads (`width`/`height` attributes → no layout shift, which is 25% of the Lighthouse
 * performance score). A client-supplied number would silently produce a wrong box. Only
 * the file header is read — a few dozen bytes — not the pixel data, so there is no
 * decoder here and no decoder bug to inherit.
 */

export type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/webp'

export interface ProbedImage {
  mimeType: SupportedImageMime
  width: number
  height: number
}

const isPng = (b: Buffer) =>
  b.length > 24 &&
  b.readUInt32BE(0) === 0x89504e47 &&
  b.readUInt32BE(4) === 0x0d0a1a0a &&
  b.toString('ascii', 12, 16) === 'IHDR'

const isJpeg = (b: Buffer) => b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff

const isWebp = (b: Buffer) =>
  b.length > 16 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP'

function pngSize(b: Buffer): ProbedImage | null {
  return { mimeType: 'image/png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}

/**
 * Walk the JPEG marker segments to the first Start-Of-Frame, which is the only place the
 * dimensions live. SOF0–SOF15 minus the four markers in that numeric range that are not
 * frame headers (DHT `c4`, JPG `c8`, DAC `cc`) — a naive `>= 0xc0 && <= 0xcf` test reads
 * a Huffman table as a frame header and returns nonsense.
 */
function jpegSize(b: Buffer): ProbedImage | null {
  let offset = 2
  while (offset + 9 < b.length) {
    if (b[offset] !== 0xff) return null
    const marker = b[offset + 1]!
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    const length = b.readUInt16BE(offset + 2)
    if (length < 2) return null
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof) {
      return { mimeType: 'image/jpeg', height: b.readUInt16BE(offset + 5), width: b.readUInt16BE(offset + 7) }
    }
    offset += 2 + length
  }
  return null
}

/** VP8 (lossy), VP8L (lossless) and VP8X (extended) each store the size differently. */
function webpSize(b: Buffer): ProbedImage | null {
  const chunk = b.toString('ascii', 12, 16)
  if (chunk === 'VP8 ' && b.length > 30) {
    return { mimeType: 'image/webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
  }
  if (chunk === 'VP8L' && b.length > 25) {
    const bits = b.readUInt32LE(21)
    return { mimeType: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X' && b.length > 30) {
    return {
      mimeType: 'image/webp',
      width: (b[24]! | (b[25]! << 8) | (b[26]! << 16)) + 1,
      height: (b[27]! | (b[28]! << 8) | (b[29]! << 16)) + 1,
    }
  }
  return null
}

/**
 * @returns the sniffed type and dimensions, or `null` when the bytes are not a
 *   JPEG/PNG/WebP whose header can be read — which the caller must treat as a rejection,
 *   never as "store it anyway".
 */
export function probeImage(bytes: Buffer): ProbedImage | null {
  const probed = isPng(bytes)
    ? pngSize(bytes)
    : isJpeg(bytes)
      ? jpegSize(bytes)
      : isWebp(bytes)
        ? webpSize(bytes)
        : null

  if (!probed) return null
  if (!Number.isInteger(probed.width) || !Number.isInteger(probed.height)) return null
  if (probed.width < 1 || probed.height < 1) return null
  return probed
}
