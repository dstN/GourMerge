#!/usr/bin/env node
/**
 * i18n Bilingual CI Gate
 *
 * Fails (exit 1) if:
 * 1. DE and EN locale files have different keys at any depth (parity check)
 * 2. Any key has an empty string value in either locale
 *
 * Run: node scripts/i18n-check.mjs
 * Wired into CI via `npm run i18n:check`
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const enPath = resolve(root, 'i18n/locales/en.json')
const dePath = resolve(root, 'i18n/locales/de.json')

const en = JSON.parse(readFileSync(enPath, 'utf8'))
const de = JSON.parse(readFileSync(dePath, 'utf8'))

let errors = 0

/**
 * Flatten a nested JSON object into dot-notation keys.
 * { a: { b: 'val' } } → { 'a.b': 'val' }
 */
function flatten(obj, prefix = '') {
  const result = {}
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

const flatEn = flatten(en)
const flatDe = flatten(de)

const enKeys = new Set(Object.keys(flatEn))
const deKeys = new Set(Object.keys(flatDe))

// ── 1. Parity check ─────────────────────────────────────────────
for (const key of enKeys) {
  if (!deKeys.has(key)) {
    console.error(`[i18n] MISSING in DE: ${key}`)
    errors++
  }
}
for (const key of deKeys) {
  if (!enKeys.has(key)) {
    console.error(`[i18n] MISSING in EN: ${key}`)
    errors++
  }
}

// ── 2. Empty value check ─────────────────────────────────────────
for (const [key, value] of Object.entries(flatEn)) {
  if (value === '' || value === null || value === undefined) {
    console.error(`[i18n] EMPTY value in EN: ${key}`)
    errors++
  }
}
for (const [key, value] of Object.entries(flatDe)) {
  if (value === '' || value === null || value === undefined) {
    console.error(`[i18n] EMPTY value in DE: ${key}`)
    errors++
  }
}

// ── Summary ──────────────────────────────────────────────────────
const enCount = enKeys.size
const deCount = deKeys.size

if (errors === 0) {
  console.log(`[i18n] ✓ OK — ${enCount} EN keys, ${deCount} DE keys, all in parity, no empty values.`)
  process.exit(0)
} else {
  console.error(`\n[i18n] ✗ FAILED — ${errors} issue(s) found. Fix before merging.`)
  process.exit(1)
}
