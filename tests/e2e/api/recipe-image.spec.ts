import { test, expect } from '@playwright/test'
import { resetRateLimits } from '../support/db'
import sharp from 'sharp'
import { uniqueUser, registerUser, createRecipe } from '../support/api'

/**
 * The recipe photo: upload, delivery, and the rules that make storing user bytes safe.
 *
 * Two kinds of fixture, and the difference matters. Paths rejected **before** any decode —
 * wrong format, out-of-range dimensions, over the wire cap — use a hand-built header, which
 * is all `probeImage()` ever reads and is reviewable in a way a binary blob is not. Paths
 * that reach the encoder use a real, decodable PNG, because the upload now re-encodes to
 * WebP and a fake fixture would only ever exercise the fail-open branch.
 *
 * What is actually at stake here, in order:
 *
 * 1. The stored MIME type comes from the bytes, never from the upload's own header —
 *    otherwise an SVG announced as `image/png` is served back as SVG and executes on our
 *    origin.
 * 2. Only the owner may write, and a private recipe's photo 404s for everyone else — the
 *    image route must not become the existence oracle the recipe route carefully is not.
 * 3. The delivery URL is content-addressed, so it can be cached hard without ever going
 *    stale — and the checksum describes the bytes we STORE, not the ones that arrived,
 *    which is the part re-encoding could have quietly broken.
 * 4. Storage is minimised: what lands in the row is WebP and smaller than what was sent.
 */
test.describe.configure({ mode: 'serial' })
test.beforeEach(async () => {
  await resetRateLimits()
})

/**
 * A **real**, decodable image of the requested size.
 *
 * The fixtures used to be hand-built headers padded with zeroes, which was right when the
 * server only read the header. It no longer is: the upload decodes and re-encodes to WebP
 * (`imageEncode.ts`), so a fake fixture would exercise only the fail-open branch and let a
 * genuinely broken encoder pass.
 *
 * The content is a smooth gradient with mild noise on top, which is deliberate on both
 * counts. Flat colour compresses to almost nothing and makes every size assertion
 * meaningless; pure random noise is incompressible, and the first attempt produced a 4.3 MB
 * PNG that the 2 MB wire cap correctly rejected before the test could reach the encoder at
 * all. This sits where a photograph sits.
 *
 * JPEG by default because that is what a phone actually uploads, and because WebP at q80
 * reliably beats it — which is what makes `byteSize < source.length` a real assertion rather
 * than a coin flip.
 */
async function realPhoto(width: number, height: number, format: 'jpeg' | 'png' = 'jpeg'): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      const wave = Math.sin(x / 40) * 40 + Math.cos(y / 55) * 40
      const grain = ((x * 7 + y * 13) % 17) - 8
      pixels[i] = Math.max(0, Math.min(255, 140 + wave + grain))
      pixels[i + 1] = Math.max(0, Math.min(255, 110 + wave * 0.6 + grain))
      pixels[i + 2] = Math.max(0, Math.min(255, 80 + wave * 0.3 + grain))
    }
  }
  const img = sharp(pixels, { raw: { width, height, channels: 3 } })
  return format === 'png' ? img.png().toBuffer() : img.jpeg({ quality: 92 }).toBuffer()
}

/** A header-only PNG, for the paths that are still rejected before any decode happens. */
function pngHeader(width: number, height: number, padTo = 2048): Buffer {
  const b = Buffer.alloc(Math.max(33, padTo))
  b.writeUInt32BE(0x89504e47, 0)
  b.writeUInt32BE(0x0d0a1a0a, 4)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(width, 16)
  b.writeUInt32BE(height, 20)
  return b
}

const upload = (buffer: Buffer, mimeType = 'image/png', altText = '') => ({
  file: { name: 'cover.png', mimeType, buffer },
  altText,
})

test('owner uploads, it is re-encoded to WebP, and the payload describes what is stored', async ({ request }) => {
  const owner = await registerUser(request)
  const recipe = await createRecipe(request, { title: 'Photogenic Pie', visibility: 'public' })

  const source = await realPhoto(1600, 900)
  const put = await request.put(`/api/recipes/${recipe.id}/image`, {
    multipart: upload(source, 'image/jpeg', 'Angerichteter Teller'),
  })
  expect(put.ok()).toBeTruthy()
  const meta = await put.json()

  // Stored as WebP regardless of what came in — that is the storage-minimisation claim.
  expect(meta).toMatchObject({ width: 1600, height: 900, mimeType: 'image/webp', altText: 'Angerichteter Teller' })
  expect(meta.recompressed, 'sharp did not run — is the native binary missing?').toBe(true)
  expect(meta.byteSize, 'the re-encode made the file bigger').toBeLessThan(source.length)
  expect(meta.checksum).toMatch(/^[0-9a-f]{64}$/)

  // The recipe payload carries the metadata but never the bytes — the page has to be able
  // to reserve the box, and must not pay a megabyte of base64 to do it.
  const detail = await (await request.get(`/api/recipes/by-slug/${owner.username}/${recipe.slug}`)).json()
  expect(detail.image).toMatchObject({ width: 1600, height: 900, checksum: meta.checksum })
  expect(JSON.stringify(detail).length).toBeLessThan(60_000)

  const get = await request.get(`/api/recipes/${recipe.id}/image?v=${meta.checksum}`)
  expect(get.status()).toBe(200)
  expect(get.headers()['content-type']).toContain('image/webp')
  // Content-addressed URL → safe to cache for a year. The checksum must be of the STORED
  // bytes: computing it before the re-encode would have made every ETag a lie.
  expect(get.headers()['cache-control']).toContain('immutable')
  expect(get.headers()['etag']).toBe(`"${meta.checksum}"`)
  const served = await get.body()
  expect(served.length).toBe(meta.byteSize)
  expect(served.subarray(0, 4).toString('ascii'), 'the served bytes are not a WebP').toBe('RIFF')
  // A user-supplied filename must never reach a response header.
  expect(get.headers()['content-disposition']).toBe(`inline; filename="recipe-${recipe.id}.webp"`)

  // A matching ETag is a 304, not a second full transfer.
  const revalidated = await request.get(`/api/recipes/${recipe.id}/image`, {
    headers: { 'if-none-match': `"${meta.checksum}"` },
  })
  expect(revalidated.status()).toBe(304)
})

test('an oversized picture is scaled down to the stored ceiling', async ({ request }) => {
  await registerUser(request)
  const recipe = await createRecipe(request, { visibility: 'public' })

  // 3000px wide on the wire, 1600 in the row: the cap is applied where it saves storage,
  // not only in the browser, so a caller that skips the uploader gets it too.
  const meta = await (
    await request.put(`/api/recipes/${recipe.id}/image`, { multipart: upload(await realPhoto(3000, 1500)) })
  ).json()
  expect(meta.width).toBe(1600)
  expect(meta.height).toBe(800)
  expect(meta.mimeType).toBe('image/webp')
})

test('the stored type comes from the bytes, not from the upload header', async ({ request }) => {
  await registerUser(request)
  const recipe = await createRecipe(request, { visibility: 'public' })

  // The attack this closes: an SVG that announces itself as a PNG. If the announced type
  // were stored and echoed back, the browser would parse it as a document and run the
  // script inside it, on our own origin.
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" onload="alert(1)"></svg>',
    'utf8'
  )
  expect((await request.put(`/api/recipes/${recipe.id}/image`, { multipart: upload(svg, 'image/png') })).status()).toBe(
    415
  )

  // And the inverse: real PNG bytes announced as `application/octet-stream` are accepted,
  // because the decision is made from the magic bytes and the part header is ignored
  // entirely. (What lands in the row is WebP either way — the re-encode normalises it — so
  // the acceptance itself is what proves the sniff, together with the SVG rejection above.)
  const put = await request.put(`/api/recipes/${recipe.id}/image`, {
    multipart: upload(await realPhoto(800, 600, 'png'), 'application/octet-stream'),
  })
  expect(put.ok()).toBeTruthy()
  expect((await put.json()).mimeType).toBe('image/webp')
})

test('a decompression bomb is refused by pixel count, not just by byte count', async ({ request }) => {
  await registerUser(request)
  const recipe = await createRecipe(request, { visibility: 'public' })

  // The case a size cap does nothing about: a small file that decodes enormous. This one is
  // caught by the dimension check on the header, before sharp is handed anything — which is
  // the order that matters, since `limitInputPixels` is the second line of defence and not
  // the first.
  const bomb = pngHeader(30_000, 30_000)
  expect((await request.put(`/api/recipes/${recipe.id}/image`, { multipart: upload(bomb) })).status()).toBe(422)
})

test('dimensions and size are bounded', async ({ request }) => {
  await registerUser(request)
  const recipe = await createRecipe(request, { visibility: 'public' })

  // Too small to be a photo, and too large to lay out.
  expect(
    (await request.put(`/api/recipes/${recipe.id}/image`, { multipart: upload(pngHeader(64, 64)) })).status()
  ).toBe(422)
  expect(
    (await request.put(`/api/recipes/${recipe.id}/image`, { multipart: upload(pngHeader(9000, 9000)) })).status()
  ).toBe(422)

  // Over the wire cap. `readMultipartFormData` buffers the whole request, so this is
  // refused from `Content-Length` before the body is read at all.
  expect(
    (
      await request.put(`/api/recipes/${recipe.id}/image`, {
        multipart: upload(pngHeader(1600, 900, 4 * 1024 * 1024)),
      })
    ).status()
  ).toBe(413)
})

test('replacing swaps the bytes and the cache key; deleting removes the row', async ({ request }) => {
  await registerUser(request)
  const recipe = await createRecipe(request, { visibility: 'public' })

  const first = await (
    await request.put(`/api/recipes/${recipe.id}/image`, { multipart: upload(await realPhoto(1600, 900)) })
  ).json()
  const second = await (
    await request.put(`/api/recipes/${recipe.id}/image`, { multipart: upload(await realPhoto(1200, 1200)) })
  ).json()

  // A different image is a different URL, which is what makes `immutable` honest.
  expect(second.checksum).not.toBe(first.checksum)
  expect(second).toMatchObject({ width: 1200, height: 1200 })

  expect((await request.delete(`/api/recipes/${recipe.id}/image`)).ok()).toBeTruthy()
  expect((await request.get(`/api/recipes/${recipe.id}/image`)).status()).toBe(404)
})

test('only the owner writes, and a private photo is invisible to everyone else', async ({ request }) => {
  const owner = await registerUser(request)
  const publicRecipe = await createRecipe(request, { visibility: 'public' })
  const privateRecipe = await createRecipe(request, { title: 'Secret Sauce', visibility: 'private' })
  await request.put(`/api/recipes/${privateRecipe.id}/image`, { multipart: upload(pngHeader(1600, 900)) })
  await request.post('/auth/logout')

  // Anonymous.
  expect(
    (await request.put(`/api/recipes/${publicRecipe.id}/image`, { multipart: upload(pngHeader(1600, 900)) })).status()
  ).toBe(401)
  expect((await request.get(`/api/recipes/${privateRecipe.id}/image`)).status()).toBe(404)

  // Signed in, but not the owner. 403 on someone else's public recipe (the recipe is not a
  // secret, the write is refused); 404 on their private one (the recipe's existence is).
  await registerUser(request, uniqueUser('stranger'))
  expect(
    (await request.put(`/api/recipes/${publicRecipe.id}/image`, { multipart: upload(pngHeader(1600, 900)) })).status()
  ).toBe(403)
  expect((await request.delete(`/api/recipes/${publicRecipe.id}/image`)).status()).toBe(403)
  expect((await request.get(`/api/recipes/${privateRecipe.id}/image`)).status()).toBe(404)
  expect(
    (await request.put(`/api/recipes/${privateRecipe.id}/image`, { multipart: upload(pngHeader(1600, 900)) })).status()
  ).toBe(404)
  expect(owner.username).toBeTruthy()
})
