import { describe, test, expect } from 'vitest'
import { generatePublicId, bufferToUuid, uuidToBuffer } from '../../server/utils/uuid'

describe('uuid (BINARY(16) ↔ canonical string)', () => {
  test('generatePublicId returns a 16-byte Buffer', () => {
    const buf = generatePublicId()
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBe(16)
  })

  test('generatePublicId produces a valid v7 UUID (version nibble = 7)', () => {
    const uuid = bufferToUuid(generatePublicId())
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  test('successive ids are unique', () => {
    const a = bufferToUuid(generatePublicId())
    const b = bufferToUuid(generatePublicId())
    expect(a).not.toBe(b)
  })

  test('bufferToUuid formats 16 bytes as canonical 36-char UUID', () => {
    const buf = Buffer.from('0123456789abcdef0123456789abcdef', 'hex')
    expect(bufferToUuid(buf)).toBe('01234567-89ab-cdef-0123-456789abcdef')
  })

  test('uuidToBuffer is the inverse of bufferToUuid (round-trip)', () => {
    const buf = generatePublicId()
    const roundTripped = uuidToBuffer(bufferToUuid(buf))
    expect(roundTripped.equals(buf)).toBe(true)
  })

  test('uuidToBuffer parses a hyphenated UUID to 16 bytes', () => {
    const buf = uuidToBuffer('01234567-89ab-cdef-0123-456789abcdef')
    expect(buf.length).toBe(16)
    expect(buf.toString('hex')).toBe('0123456789abcdef0123456789abcdef')
  })
})
