import { test, expect } from '@playwright/test'
import { resetRateLimits } from '../support/db'
import sharp from 'sharp'
import { registerUser } from '../support/api'

/**
 * The uploaded profile picture: crop invariant, delivery, and the same storage rules as the
 * recipe photo (`recipe-image.spec.ts`) with one addition — squareness is enforced on the
 * server, not only by the client-side cropper, because `user_avatars.edge` and every
 * consumer of it assume `width === height` unconditionally.
 */
test.describe.configure({ mode: 'serial' })
test.beforeEach(async () => {
  await resetRateLimits()
})

/** A real, decodable square photo — see `recipe-image.spec.ts` for why it must decode. */
async function realSquarePhoto(edge: number): Promise<Buffer> {
  const pixels = Buffer.alloc(edge * edge * 3)
  for (let y = 0; y < edge; y++) {
    for (let x = 0; x < edge; x++) {
      const i = (y * edge + x) * 3
      const wave = Math.sin(x / 30) * 40 + Math.cos(y / 45) * 40
      const grain = ((x * 7 + y * 13) % 17) - 8
      pixels[i] = Math.max(0, Math.min(255, 90 + wave + grain))
      pixels[i + 1] = Math.max(0, Math.min(255, 130 + wave * 0.6 + grain))
      pixels[i + 2] = Math.max(0, Math.min(255, 160 + wave * 0.3 + grain))
    }
  }
  return sharp(pixels, { raw: { width: edge, height: edge, channels: 3 } })
    .jpeg({ quality: 92 })
    .toBuffer()
}

/** Header-only PNG, for paths rejected before any decode happens. */
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

const upload = (buffer: Buffer, mimeType = 'image/jpeg') => ({
  file: { name: 'avatar.jpg', mimeType, buffer },
})

test('upload is re-encoded to WebP, the profile and delivery URL agree, and it caches forever', async ({ request }) => {
  const owner = await registerUser(request)

  const source = await realSquarePhoto(900)
  const put = await request.put('/api/users/me/avatar', { multipart: upload(source) })
  expect(put.ok()).toBeTruthy()
  const meta = await put.json()

  expect(meta.mimeType).toBe('image/webp')
  expect(meta.edge).toBe(512) // downscaled to AVATAR_MAX_EDGE
  expect(meta.recompressed, 'sharp did not run — is the native binary missing?').toBe(true)
  expect(meta.byteSize).toBeLessThan(source.length)
  expect(meta.checksum).toMatch(/^[0-9a-f]{64}$/)
  expect(meta.avatarUrl).toBe(`/api/users/${owner.username}/avatar-image?v=${meta.checksum}`)

  const profile = await (await request.get(`/api/users/${owner.username}`)).json()
  expect(profile.user.avatarUrl).toBe(meta.avatarUrl)

  const get = await request.get(meta.avatarUrl)
  expect(get.status()).toBe(200)
  expect(get.headers()['content-type']).toContain('image/webp')
  expect(get.headers()['cache-control']).toContain('immutable')
  expect(get.headers()['etag']).toBe(`"${meta.checksum}"`)
  const served = await get.body()
  expect(served.length).toBe(meta.byteSize)
  expect(served.subarray(0, 4).toString('ascii'), 'the served bytes are not a WebP').toBe('RIFF')

  const revalidated = await request.get(`/api/users/${owner.username}/avatar-image`, {
    headers: { 'if-none-match': `"${meta.checksum}"` },
  })
  expect(revalidated.status()).toBe(304)
})

test('a non-square image is refused even though the client always crops to one', async ({ request }) => {
  await registerUser(request)

  const wide = await realSquarePhoto(400) // start square, then make it non-square below
  const nonSquare = await sharp(wide).resize(600, 400, { fit: 'fill' }).jpeg().toBuffer()

  const res = await request.put('/api/users/me/avatar', { multipart: upload(nonSquare) })
  expect(res.status()).toBe(422)
})

test('the stored type comes from the bytes, not the upload header', async ({ request }) => {
  await registerUser(request)

  // Same attack as the recipe photo: an SVG announcing itself as a JPEG must not be stored
  // and served back as SVG on our own origin.
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"></svg>', 'utf8')
  expect((await request.put('/api/users/me/avatar', { multipart: upload(svg, 'image/jpeg') })).status()).toBe(415)
})

test('a decompression bomb is refused by pixel count, before any decode', async ({ request }) => {
  await registerUser(request)
  const bomb = pngHeader(20_000, 20_000)
  expect((await request.put('/api/users/me/avatar', { multipart: upload(bomb, 'image/png') })).status()).toBe(422)
})

test('dimensions and size are bounded', async ({ request }) => {
  await registerUser(request)

  expect(
    (await request.put('/api/users/me/avatar', { multipart: upload(pngHeader(32, 32), 'image/png') })).status()
  ).toBe(422)
  expect(
    (await request.put('/api/users/me/avatar', { multipart: upload(pngHeader(5000, 5000), 'image/png') })).status()
  ).toBe(422)

  // Over the wire cap (512 KB). `readMultipartFormData` buffers the whole request, so this
  // is refused from `Content-Length` before the body is read.
  expect(
    (
      await request.put('/api/users/me/avatar', {
        multipart: upload(pngHeader(512, 512, 600 * 1024), 'image/png'),
      })
    ).status()
  ).toBe(413)
})

test('replacing swaps the checksum; deleting clears the row, the profile and the session', async ({ request }) => {
  const owner = await registerUser(request)

  const first = await (
    await request.put('/api/users/me/avatar', { multipart: upload(await realSquarePhoto(300)) })
  ).json()
  const second = await (
    await request.put('/api/users/me/avatar', { multipart: upload(await realSquarePhoto(600)) })
  ).json()
  expect(second.checksum).not.toBe(first.checksum)
  expect((await request.get(`/api/users/${owner.username}/avatar-image?v=${first.checksum}`)).status()).toBe(200)

  expect((await request.delete('/api/users/me/avatar')).ok()).toBeTruthy()

  expect((await request.get(second.avatarUrl)).status()).toBe(404)
  const profile = await (await request.get(`/api/users/${owner.username}`)).json()
  expect(profile.user.avatarUrl).toBeNull()

  // The session cookie itself must reflect the clear, not only the DB row — a `null` set
  // through `setUserSession`'s `defu` merge would silently keep the old value here.
  const session = await (await request.get('/api/_auth/session')).json()
  expect(session.user.avatarUrl).toBeNull()
})

test('only the signed-in owner can write; anonymous is refused', async ({ request }) => {
  const anon = await request.put('/api/users/me/avatar', { multipart: upload(await realSquarePhoto(300)) })
  expect(anon.status()).toBe(401)
  expect((await request.delete('/api/users/me/avatar')).status()).toBe(401)
})

test('a user with no upload falls back to the generated identicon, never a 404 page image', async ({ request }) => {
  const user = await registerUser(request)
  expect((await request.get(`/api/users/${user.username}/avatar-image`)).status()).toBe(404)
  expect((await request.get(`/api/users/${user.username}/avatar`)).status()).toBe(200)
})
