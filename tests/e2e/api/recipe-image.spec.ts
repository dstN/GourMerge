import { test, expect } from '@playwright/test'
import { resetRateLimits } from '../support/db'
import { uniqueUser, registerUser, createRecipe } from '../support/api'

/**
 * The recipe photo: upload, delivery, and the rules that make storing user bytes safe.
 *
 * The server never decodes an image (see `server/utils/imageProbe.ts` — it reads the
 * header and nothing else), so these fixtures are synthetic headers rather than real
 * files. That is not a shortcut: it is the same surface the production code touches, and a
 * byte-exact header is reviewable in a way a binary blob is not.
 *
 * What is actually at stake here, in order:
 *
 * 1. The stored MIME type comes from the bytes, never from the upload's own header —
 *    otherwise an SVG announced as `image/png` is served back as SVG and executes on our
 *    origin.
 * 2. Only the owner may write, and a private recipe's photo 404s for everyone else — the
 *    image route must not become the existence oracle the recipe route carefully is not.
 * 3. The delivery URL is content-addressed, so it can be cached hard without ever going
 *    stale.
 */
test.describe.configure({ mode: 'serial' })
test.beforeEach(async () => {
  await resetRateLimits()
})

/** A PNG that is only a header — all `probeImage` ever reads — padded to a plausible size. */
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

test('owner uploads, the payload carries metadata, and the bytes come back correctly typed', async ({ request }) => {
  const owner = await registerUser(request)
  const recipe = await createRecipe(request, { title: 'Photogenic Pie', visibility: 'public' })

  const put = await request.put(`/api/recipes/${recipe.id}/image`, {
    multipart: upload(pngHeader(1600, 900), 'image/png', 'Angerichteter Teller'),
  })
  expect(put.ok()).toBeTruthy()
  const meta = await put.json()
  expect(meta).toMatchObject({ width: 1600, height: 900, mimeType: 'image/png', altText: 'Angerichteter Teller' })
  expect(meta.checksum).toMatch(/^[0-9a-f]{64}$/)

  // The recipe payload carries the metadata but never the bytes — the page has to be able
  // to reserve the box, and must not pay a megabyte of base64 to do it.
  const detail = await (await request.get(`/api/recipes/by-slug/${owner.username}/${recipe.slug}`)).json()
  expect(detail.image).toMatchObject({ width: 1600, height: 900, checksum: meta.checksum })
  expect(JSON.stringify(detail).length).toBeLessThan(60_000)

  const get = await request.get(`/api/recipes/${recipe.id}/image?v=${meta.checksum}`)
  expect(get.status()).toBe(200)
  expect(get.headers()['content-type']).toContain('image/png')
  // Content-addressed URL → safe to cache for a year.
  expect(get.headers()['cache-control']).toContain('immutable')
  expect(get.headers()['etag']).toBe(`"${meta.checksum}"`)
  // A user-supplied filename must never reach a response header.
  expect(get.headers()['content-disposition']).toBe(`inline; filename="recipe-${recipe.id}.png"`)

  // A matching ETag is a 304, not a second full transfer.
  const revalidated = await request.get(`/api/recipes/${recipe.id}/image`, {
    headers: { 'if-none-match': `"${meta.checksum}"` },
  })
  expect(revalidated.status()).toBe(304)
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

  // And the inverse: real PNG bytes announced as something else are still stored as PNG.
  const put = await request.put(`/api/recipes/${recipe.id}/image`, {
    multipart: upload(pngHeader(800, 600), 'application/octet-stream'),
  })
  expect(put.ok()).toBeTruthy()
  expect((await put.json()).mimeType).toBe('image/png')
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
    await request.put(`/api/recipes/${recipe.id}/image`, { multipart: upload(pngHeader(1600, 900)) })
  ).json()
  const second = await (
    await request.put(`/api/recipes/${recipe.id}/image`, { multipart: upload(pngHeader(1200, 1200)) })
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
