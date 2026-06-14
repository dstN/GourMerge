import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const root = resolve(__dirname, '../..')

function flatten(obj: Record<string, any>, prefix = ''): Record<string, any> {
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flatten(value, fullKey))
    } else {
      result[fullKey] = value
    }
  }
  return result
}

const en = JSON.parse(readFileSync(resolve(root, 'i18n/locales/en.json'), 'utf8'))
const de = JSON.parse(readFileSync(resolve(root, 'i18n/locales/de.json'), 'utf8'))

const flatEn = flatten(en)
const flatDe = flatten(de)

describe('i18n bilingual gate', () => {
  it('EN and DE have the same number of keys', () => {
    const enCount = Object.keys(flatEn).length
    const deCount = Object.keys(flatDe).length
    expect(enCount).toBe(deCount)
  })

  it('every EN key exists in DE', () => {
    const deKeys = new Set(Object.keys(flatDe))
    const missingInDe = Object.keys(flatEn).filter((k) => !deKeys.has(k))
    expect(missingInDe).toEqual([])
  })

  it('every DE key exists in EN', () => {
    const enKeys = new Set(Object.keys(flatEn))
    const missingInEn = Object.keys(flatDe).filter((k) => !enKeys.has(k))
    expect(missingInEn).toEqual([])
  })

  it('no EN value is empty', () => {
    const emptyKeys = Object.entries(flatEn)
      .filter(([, v]) => v === '' || v === null || v === undefined)
      .map(([k]) => k)
    expect(emptyKeys).toEqual([])
  })

  it('no DE value is empty', () => {
    const emptyKeys = Object.entries(flatDe)
      .filter(([, v]) => v === '' || v === null || v === undefined)
      .map(([k]) => k)
    expect(emptyKeys).toEqual([])
  })
})
