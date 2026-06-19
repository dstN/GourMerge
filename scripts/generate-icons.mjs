/**
 * Generate all PWA/favicon icon assets from the official GourMerge logo.
 *
 * Usage:
 *   node scripts/generate-icons.mjs
 *   node scripts/generate-icons.mjs --dry-run   (prints what would be generated)
 *
 * Requires: sharp (npm install --save-dev sharp)
 *
 * Output files (orange glyph, transparent background):
 *   public/favicon.svg          — inline orange SVG (no rasterization)
 *   public/icon.svg             — same, for PWA manifest
 *   public/favicon.ico          — 32x32 ICO (PNG inside)
 *   public/pwa-64x64.png
 *   public/pwa-192x192.png
 *   public/pwa-512x512.png
 *   public/apple-touch-icon-180x180.png
 *   public/maskable-icon-512x512.png   — with safe-zone padding (~18%)
 */

import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const isDryRun = process.argv.includes('--dry-run')

// Primary orange — matches --color-primary-500 in main.css (#f97316)
const ORANGE = '#f97316'

// ── Build orange SVG from the source logo ────────────────────────────────────
// The source uses fill="#000000"; we swap it to ORANGE and change the
// internal g transform to use the correct coordinate system.
const sourceSvg = readFileSync(resolve(ROOT, 'public/logo_gourmerge.svg'), 'utf8')
const orangeSvg = sourceSvg.replace(/fill="#000000"/g, `fill="${ORANGE}"`).replace(/fill="black"/gi, `fill="${ORANGE}"`)

// ── Maskable SVG: add 18% safe-zone padding by scaling down the glyph ────────
// For maskable icons, the glyph must fit within the central 80% circle.
// We do this by wrapping in a 512x512 canvas with the glyph scaled to 82%.
const MASKABLE_SIZE = 512
const MASKABLE_SCALE = 0.82
const MASKABLE_OFFSET = (MASKABLE_SIZE * (1 - MASKABLE_SCALE)) / 2

// viewBox of the source: "931 133 959 1036"
const VB = { x: 931, y: 133, w: 959, h: 1036 }
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MASKABLE_SIZE}" height="${MASKABLE_SIZE}" viewBox="0 0 ${MASKABLE_SIZE} ${MASKABLE_SIZE}">
  <g transform="translate(${MASKABLE_OFFSET},${MASKABLE_OFFSET}) scale(${MASKABLE_SCALE},${MASKABLE_SCALE})">
    <svg x="0" y="0" width="${MASKABLE_SIZE}" height="${MASKABLE_SIZE}" viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" fill="${ORANGE}">
      ${orangeSvg.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '')}
    </svg>
  </g>
</svg>`

// ── Outputs ──────────────────────────────────────────────────────────────────
const outputs = [
  { file: 'public/favicon.svg', type: 'svg', svg: orangeSvg },
  { file: 'public/icon.svg', type: 'svg', svg: orangeSvg },
  { file: 'public/pwa-64x64.png', type: 'png', size: 64, svg: orangeSvg },
  { file: 'public/pwa-192x192.png', type: 'png', size: 192, svg: orangeSvg },
  { file: 'public/pwa-512x512.png', type: 'png', size: 512, svg: orangeSvg },
  { file: 'public/apple-touch-icon-180x180.png', type: 'png', size: 180, svg: orangeSvg },
  { file: 'public/maskable-icon-512x512.png', type: 'png', size: 512, svg: maskableSvg },
  { file: 'public/favicon.ico', type: 'ico', size: 32, svg: orangeSvg },
]

async function generatePng(svgContent, size) {
  return sharp(Buffer.from(svgContent))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
}

async function main() {
  console.log(`GourMerge Icon Generator — orange glyph on transparent bg`)
  if (isDryRun) {
    for (const o of outputs)
      console.log(`  DRY-RUN: would write ${o.file} (${o.type}${o.size ? ` ${o.size}×${o.size}` : ''})`)
    console.log(`DRY-RUN complete — ${outputs.length} files would be generated`)
    return
  }

  for (const o of outputs) {
    const outPath = resolve(ROOT, o.file)

    if (o.type === 'svg') {
      writeFileSync(outPath, o.svg, 'utf8')
      console.log(`  ✓ ${o.file}`)
      continue
    }

    const png = await generatePng(o.svg, o.size)

    if (o.type === 'ico') {
      // .ico = raw PNG wrapped in ICO container (modern browsers accept PNG-in-ICO)
      writeFileSync(outPath, buildIco(png, o.size))
    } else {
      writeFileSync(outPath, png)
    }
    console.log(`  ✓ ${o.file} (${o.size}×${o.size})`)
  }

  console.log(`\nAll ${outputs.length} icon assets regenerated.`)
}

// Minimal ICO builder: single 32×32 PNG image embedded in ICO container.
function buildIco(pngBuffer, size) {
  const HEADER_SIZE = 6
  const ENTRY_SIZE = 16
  const imageOffset = HEADER_SIZE + ENTRY_SIZE

  const header = Buffer.alloc(HEADER_SIZE)
  header.writeUInt16LE(0, 0) // Reserved
  header.writeUInt16LE(1, 2) // Type: ICO
  header.writeUInt16LE(1, 4) // Image count: 1

  const entry = Buffer.alloc(ENTRY_SIZE)
  const dim = size >= 256 ? 0 : size
  entry.writeUInt8(dim, 0) // Width (0 = 256)
  entry.writeUInt8(dim, 1) // Height (0 = 256)
  entry.writeUInt8(0, 2) // Color count
  entry.writeUInt8(0, 3) // Reserved
  entry.writeUInt16LE(1, 4) // Color planes
  entry.writeUInt16LE(32, 6) // Bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8) // Image data size
  entry.writeUInt32LE(imageOffset, 12) // Offset to image data

  return Buffer.concat([header, entry, pngBuffer])
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
