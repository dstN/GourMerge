/**
 * Seed the tags table with base culinary tags.
 *
 * Usage:
 *   node scripts/seed-tags.mjs
 *   node scripts/seed-tags.mjs --dry-run   (prints SQL, no writes)
 *
 * Requires DATABASE_URL to be set (e.g. via .env or shell).
 * Idempotent: uses INSERT IGNORE to skip existing rows (deduped by name).
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
// Tag list: { name (canonical EN), nameTranslations }
// ────────────────────────────────────────────────────────────
const TAGS = [
  {
    name: 'Quick',
    nameTranslations: {
      de: 'Schnell (<30 Min)',
      en: 'Quick (<30 min)',
      fr: 'Rapide (<30 min)',
      it: 'Veloce (<30 min)',
    },
  },
  {
    name: 'Meal Prep',
    nameTranslations: { de: 'Meal Prep', en: 'Meal Prep', fr: 'Préparation repas', it: 'Meal Prep' },
  },
  { name: 'Baking', nameTranslations: { de: 'Backen', en: 'Baking', fr: 'Pâtisserie', it: 'Pasticceria' } },
  { name: 'One Pot', nameTranslations: { de: 'Ein-Topf', en: 'One Pot', fr: 'Un seul pot', it: 'Un tegame' } },
  { name: 'Soup', nameTranslations: { de: 'Suppe', en: 'Soup', fr: 'Soupe', it: 'Zuppa' } },
  { name: 'Salad', nameTranslations: { de: 'Salat', en: 'Salad', fr: 'Salade', it: 'Insalata' } },
  { name: 'Dessert', nameTranslations: { de: 'Dessert', en: 'Dessert', fr: 'Dessert', it: 'Dolce' } },
  { name: 'Breakfast', nameTranslations: { de: 'Frühstück', en: 'Breakfast', fr: 'Petit-déjeuner', it: 'Colazione' } },
  { name: 'BBQ', nameTranslations: { de: 'Grillen', en: 'BBQ', fr: 'BBQ', it: 'Barbecue' } },
  { name: 'Budget', nameTranslations: { de: 'Günstig', en: 'Budget', fr: 'Économique', it: 'Economico' } },
  { name: 'Spicy', nameTranslations: { de: 'Scharf', en: 'Spicy', fr: 'Épicé', it: 'Piccante' } },
  {
    name: 'Street Food',
    nameTranslations: { de: 'Street Food', en: 'Street Food', fr: 'Street Food', it: 'Street Food' },
  },
]

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────
const conn = await createConnection(DATABASE_URL)

try {
  let inserted = 0
  let skipped = 0

  for (const tag of TAGS) {
    const nameTranslations = JSON.stringify(tag.nameTranslations)

    if (isDryRun) {
      console.log(`DRY-RUN: INSERT IGNORE "${tag.name}" — ${JSON.stringify(tag.nameTranslations)}`)
      continue
    }

    const [result] = await conn.execute('INSERT IGNORE INTO tags (name, name_translations) VALUES (?, ?)', [
      tag.name,
      nameTranslations,
    ])

    if (result.affectedRows > 0) {
      inserted++
    } else {
      skipped++
    }
  }

  if (!isDryRun) {
    console.log(`✓ Seeded ${inserted} tags, skipped ${skipped} existing`)
  } else {
    console.log(`DRY-RUN complete — ${TAGS.length} tags would be processed`)
  }
} finally {
  await conn.end()
}
