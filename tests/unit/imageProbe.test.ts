import { describe, it, expect } from 'vitest'
import { probeImage } from '../../server/utils/imageProbe'

/**
 * `probeImage` is the only thing standing between an upload and the database, so its two
 * jobs both carry real risk: deciding what the bytes *are* (a wrong answer is stored XSS —
 * see the docblock in the module) and reading the dimensions out of a header without a
 * decoder (a wrong answer is a mis-sized box on the recipe page and the layout shift the
 * `width`/`height` attributes exist to prevent).
 *
 * The fixtures are hand-built headers rather than real files: the parser only ever reads
 * the first few dozen bytes, and a byte-exact header is a far more precise test than a
 * binary blob nobody can inspect in a diff. Each helper documents the offsets it writes, so
 * a spec disagreement shows up here rather than in production.
 */

/** PNG: 8-byte signature, then a length + `IHDR` + big-endian width/height at 16 and 20. */
function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(33)
  b.writeUInt32BE(0x89504e47, 0)
  b.writeUInt32BE(0x0d0a1a0a, 4)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(width, 16)
  b.writeUInt32BE(height, 20)
  return b
}

/**
 * JPEG: `FFD8`, then length-prefixed segments until a Start-Of-Frame. `leading` lets a test
 * push non-SOF segments in front of it — including `FFC4` (DHT), which sits inside the
 * `C0..CF` numeric range and is exactly the marker a naive range check misreads as a frame.
 */
function jpeg(width: number, height: number, leading: Array<{ marker: number; payload: number }> = []): Buffer {
  const chunks: Buffer[] = [Buffer.from([0xff, 0xd8])]
  for (const seg of leading) {
    const b = Buffer.alloc(4 + seg.payload)
    b[0] = 0xff
    b[1] = seg.marker
    b.writeUInt16BE(2 + seg.payload, 2)
    chunks.push(b)
  }
  const sof = Buffer.alloc(11)
  sof[0] = 0xff
  sof[1] = 0xc0 // SOF0
  sof.writeUInt16BE(17, 2) // segment length
  sof[4] = 8 // sample precision
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  return Buffer.concat([...chunks, sof, Buffer.alloc(8)])
}

function riff(fourCC: string, body: Buffer): Buffer {
  const head = Buffer.alloc(20)
  head.write('RIFF', 0, 'ascii')
  head.writeUInt32LE(12 + body.length, 4)
  head.write('WEBP', 8, 'ascii')
  head.write(fourCC, 12, 'ascii')
  head.writeUInt32LE(body.length, 16)
  return Buffer.concat([head, body, Buffer.alloc(16)])
}

/** WebP lossy: 3-byte frame tag + 3-byte sync code, then 14-bit width/height at 26 and 28. */
function webpLossy(width: number, height: number): Buffer {
  const body = Buffer.alloc(16)
  body.writeUInt8(0x9d, 3)
  body.writeUInt8(0x01, 4)
  body.writeUInt8(0x2a, 5)
  body.writeUInt16LE(width, 6) // absolute offset 26
  body.writeUInt16LE(height, 8) // absolute offset 28
  return riff('VP8 ', body)
}

/** WebP lossless: signature byte `0x2f`, then 14 bits of (width-1) and 14 of (height-1). */
function webpLossless(width: number, height: number): Buffer {
  const body = Buffer.alloc(12)
  body.writeUInt8(0x2f, 0) // absolute offset 20
  body.writeUInt32LE((width - 1) | ((height - 1) << 14), 1) // absolute offset 21
  return riff('VP8L', body)
}

/** WebP extended: 24-bit little-endian canvas width-1 at 24, height-1 at 27. */
function webpExtended(width: number, height: number): Buffer {
  const body = Buffer.alloc(14)
  const w = width - 1
  const h = height - 1
  body.writeUInt8(w & 0xff, 4) // absolute offset 24
  body.writeUInt8((w >> 8) & 0xff, 5)
  body.writeUInt8((w >> 16) & 0xff, 6)
  body.writeUInt8(h & 0xff, 7) // absolute offset 27
  body.writeUInt8((h >> 8) & 0xff, 8)
  body.writeUInt8((h >> 16) & 0xff, 9)
  return riff('VP8X', body)
}

describe('probeImage — format detection', () => {
  it('identifies each supported format from its magic bytes', () => {
    expect(probeImage(png(10, 20))?.mimeType).toBe('image/png')
    expect(probeImage(jpeg(10, 20))?.mimeType).toBe('image/jpeg')
    expect(probeImage(webpLossy(10, 20))?.mimeType).toBe('image/webp')
    expect(probeImage(webpLossless(10, 20))?.mimeType).toBe('image/webp')
    expect(probeImage(webpExtended(10, 20))?.mimeType).toBe('image/webp')
  })

  it('rejects SVG, which is the whole reason the type is sniffed and not trusted', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>', 'utf8')
    expect(probeImage(svg)).toBeNull()
  })

  it('rejects other formats and junk rather than storing them', () => {
    expect(probeImage(Buffer.from('GIF89a', 'ascii'))).toBeNull()
    expect(probeImage(Buffer.from('%PDF-1.7\n', 'ascii'))).toBeNull()
    expect(probeImage(Buffer.alloc(0))).toBeNull()
    expect(probeImage(Buffer.alloc(64))).toBeNull()
  })

  it('rejects a truncated header instead of reading past the end of the buffer', () => {
    // 10 bytes, deliberately: a minimal JPEG's Start-Of-Frame is *complete* by byte 11
    // (SOI + marker + length + precision + height + width), so cutting at 12 leaves a
    // legitimately readable header and proves nothing. PNG and WebP need far more.
    for (const full of [png(10, 20), jpeg(10, 20), webpLossy(10, 20), webpLossless(10, 20)]) {
      expect(probeImage(full.subarray(0, 10))).toBeNull()
    }
  })

  it('rejects a RIFF container that is not WebP', () => {
    const wav = Buffer.alloc(32)
    wav.write('RIFF', 0, 'ascii')
    wav.write('WAVE', 8, 'ascii')
    expect(probeImage(wav)).toBeNull()
  })
})

describe('probeImage — dimensions', () => {
  it('reads PNG width and height from IHDR', () => {
    expect(probeImage(png(1600, 900))).toMatchObject({ width: 1600, height: 900 })
  })

  it('reads JPEG dimensions from the first Start-Of-Frame', () => {
    expect(probeImage(jpeg(1600, 900))).toMatchObject({ width: 1600, height: 900 })
  })

  it('does not mistake a Huffman table (FFC4) for a frame header', () => {
    // The trap: DHT/JPG/DAC all sit in the C0..CF range a naive check accepts. If one is
    // read as a SOF, the dimensions come back as whatever the table's bytes happen to be.
    const withTables = jpeg(1600, 900, [
      { marker: 0xe0, payload: 14 }, // APP0/JFIF
      { marker: 0xc4, payload: 30 }, // DHT — in range, not a frame
      { marker: 0xdb, payload: 65 }, // DQT
      { marker: 0xcc, payload: 8 }, // DAC — also in range, also not a frame
    ])
    expect(probeImage(withTables)).toMatchObject({ width: 1600, height: 900 })
  })

  it('skips standalone markers that carry no length field', () => {
    // RSTn (D0..D7) and TEM (01) have no length. Treating one as length-prefixed walks the
    // offset into the middle of a segment and everything after it is garbage.
    const chunks = [Buffer.from([0xff, 0xd8, 0xff, 0x01, 0xff, 0xd0])]
    const sof = Buffer.alloc(11)
    sof[0] = 0xff
    sof[1] = 0xc0
    sof.writeUInt16BE(17, 2)
    sof[4] = 8
    sof.writeUInt16BE(480, 5)
    sof.writeUInt16BE(640, 7)
    expect(probeImage(Buffer.concat([...chunks, sof, Buffer.alloc(8)]))).toMatchObject({ width: 640, height: 480 })
  })

  it('reads all three WebP chunk layouts, each of which stores the size differently', () => {
    expect(probeImage(webpLossy(1600, 900))).toMatchObject({ width: 1600, height: 900 })
    expect(probeImage(webpLossless(1600, 900))).toMatchObject({ width: 1600, height: 900 })
    expect(probeImage(webpExtended(1600, 900))).toMatchObject({ width: 1600, height: 900 })
  })

  it('handles the 14-bit WebP maximum without wrapping', () => {
    expect(probeImage(webpLossless(16384, 16384))).toMatchObject({ width: 16384, height: 16384 })
  })

  it('rejects a zero dimension, which no caller should be asked to lay out', () => {
    expect(probeImage(png(0, 100))).toBeNull()
    expect(probeImage(png(100, 0))).toBeNull()
  })
})
