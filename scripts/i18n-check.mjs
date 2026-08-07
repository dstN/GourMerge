#!/usr/bin/env node
/**
 * i18n 4-Language CI Gate
 *
 * Fails (exit 1) if:
 * 1. DE / EN / FR / IT locale files have different keys at any depth (parity check)
 * 2. Any key has an empty string value in any locale
 * 3. Any message contains an unescaped `@` (vue-i18n linked-message syntax)
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

// ── 3. Unescaped `@` (vue-i18n linked messages) ──────────────────────────────
/**
 * `@` opens a *linked message* in vue-i18n's message syntax (`@:other.key`,
 * `@.lower:other.key`). A bare `@` — the natural way to write an email placeholder —
 * makes the compiler throw `INVALID_LINKED_FORMAT`, and because production builds
 * strip the message table, it surfaces as a **500 whose entire body is the string
 * "10"**. Nothing in that points at a translation file.
 *
 * It cost a debugging session exactly once: `du@beispiel.de` in a new placeholder
 * took `/auth/login` down while every other page stayed up. The existing
 * `auth.emailPlaceholder` had it right all along (`deine{'@'}email.de`) — the
 * convention was simply invisible until it broke.
 *
 * The escape is `{'@'}`. This check is a parser, not a regex on the raw string:
 * `{'@'}` must pass while `du@x.de` must fail, and both contain `@`.
 */
for (const code of LOCALES) {
  for (const [key, value] of Object.entries(flatLocales[code])) {
    if (typeof value !== 'string' || !value.includes('@')) continue

    // Drop every correctly escaped literal, then see if any `@` survives.
    const withoutEscaped = value.replace(/\{\s*'[^']*'\s*\}/g, '')
    if (!withoutEscaped.includes('@')) continue

    // A genuine linked message (`@:key` / `@.modifier:key`) is legitimate syntax.
    const bare = withoutEscaped.replace(/@(?:\.[a-z]+)?:[\w.]+/g, '')
    if (bare.includes('@')) {
      console.error(`[i18n] UNESCAPED @ in ${code.toUpperCase()}: ${key} — write it as {'@'} (value: ${value})`)
      errors++
    }
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────
const counts = LOCALES.map((c) => `${Object.keys(flatLocales[c]).length} ${c.toUpperCase()}`).join(', ')

if (errors === 0) {
  console.log(`[i18n] ✓ OK — ${counts} — all in parity, no empty values.`)
  process.exit(0)
} else {
  console.error(`\n[i18n] ✗ FAILED — ${errors} issue(s) found. Fix before merging.`)
  process.exit(1)
}
