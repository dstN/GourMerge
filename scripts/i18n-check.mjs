#!/usr/bin/env node
/**
 * i18n 4-Language CI Gate
 *
 * Fails (exit 1) if:
 * 1. DE / EN / FR / IT locale files have different keys at any depth (parity check)
 * 2. Any key has an empty string value in any locale
 *
 * Run: node scripts/i18n-check.mjs
 * Wired into CI via `npm run i18n:check`
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const LOCALES = ['de', 'en', 'fr', 'it']

const localeData = {}
for (const code of LOCALES) {
  const filePath = resolve(root, `i18n/locales/${code}.json`)
  localeData[code] = JSON.parse(readFileSync(filePath, 'utf8'))
}

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

const flatLocales = {}
for (const code of LOCALES) {
  flatLocales[code] = flatten(localeData[code])
}

// Use DE as the reference key set
const referenceKeys = new Set(Object.keys(flatLocales['de']))

// ── 1. Parity check (all locales vs DE) ─────────────────────────────────────
for (const code of LOCALES) {
  if (code === 'de') continue
  const keys = new Set(Object.keys(flatLocales[code]))

  for (const key of referenceKeys) {
    if (!keys.has(key)) {
      console.error(`[i18n] MISSING in ${code.toUpperCase()}: ${key}`)
      errors++
    }
  }
  for (const key of keys) {
    if (!referenceKeys.has(key)) {
      console.error(`[i18n] EXTRA in ${code.toUpperCase()} (not in DE): ${key}`)
      errors++
    }
  }
}

// ── 2. Empty value check (all locales) ───────────────────────────────────────
for (const code of LOCALES) {
  for (const [key, value] of Object.entries(flatLocales[code])) {
    if (value === '' || value === null || value === undefined) {
      console.error(`[i18n] EMPTY value in ${code.toUpperCase()}: ${key}`)
      errors++
    }
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────
const counts = LOCALES.map(c => `${Object.keys(flatLocales[c]).length} ${c.toUpperCase()}`).join(', ')

if (errors === 0) {
  console.log(`[i18n] ✓ OK — ${counts} — all in parity, no empty values.`)
  process.exit(0)
} else {
  console.error(`\n[i18n] ✗ FAILED — ${errors} issue(s) found. Fix before merging.`)
  process.exit(1)
}
