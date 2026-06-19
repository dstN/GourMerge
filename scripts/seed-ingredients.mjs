/**
 * Seed the ingredients master table with common cooking ingredients.
 *
 * Usage:
 *   node scripts/seed-ingredients.mjs
 *   node scripts/seed-ingredients.mjs --dry-run   (prints SQL, no writes)
 *
 * Requires DATABASE_URL to be set (e.g. via .env or shell).
 * Skips existing rows (dedupes by lowercase name).
 */

import { createConnection } from 'mysql2/promise'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDryRun = process.argv.includes('--dry-run')

// Load .env manually (no dotenv dep needed)
function loadEnv() {
  try {
    const envPath = resolve(__dirname, '../.env')
    const lines = readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* no .env file — rely on environment */
  }
}
loadEnv()

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.')
  process.exit(1)
}

// ────────────────────────────────────────────────────────────
// Ingredient list
//
// The Swiss BLV Food Composition Database (import-swiss-foods.mjs)
// is the authoritative source for all ingredients + nutrition data.
// This list is intentionally empty — use the Swiss import instead.
//
// To add an ingredient that has no Swiss BLV entry, add it here
// with { name, de, category }. It will be seeded without nutrition
// data, which can be filled in manually via the ingredient_nutrition
// table with source = 'curated'.
// ────────────────────────────────────────────────────────────
const INGREDIENTS = []

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────
const conn = await createConnection(DATABASE_URL)

try {
  let inserted = 0
  let skipped = 0

  for (const ing of INGREDIENTS) {
    const nameTranslations = JSON.stringify({ en: ing.name, de: ing.de })

    if (isDryRun) {
      console.log(`DRY-RUN: INSERT "${ing.name}" (${ing.de}) [${ing.category}]`)
      continue
    }

    const [existing] = await conn.execute('SELECT id FROM ingredients WHERE LOWER(name) = LOWER(?)', [ing.name])
    if (existing.length > 0) {
      skipped++
      continue
    }

    await conn.execute('INSERT INTO ingredients (name, name_translations, category) VALUES (?, ?, ?)', [
      ing.name,
      nameTranslations,
      ing.category,
    ])
    inserted++
  }

  if (!isDryRun) {
    console.log(`✓ Seeded ${inserted} ingredients, skipped ${skipped} existing`)
  } else {
    console.log(`DRY-RUN complete — ${INGREDIENTS.length} ingredients would be processed`)
  }
} finally {
  await conn.end()
}
