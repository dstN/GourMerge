/**
 * Rebuild `ingredient_search_terms` from `ingredients` — the whole table, every row.
 *
 * The autocomplete (`GET /api/ingredients`) matches on this table, not on the JSON name
 * columns. The importers maintain it for the rows they write and the create/edit API
 * handlers for user rows, but a seed that predates the table, a row inserted by hand
 * (`seed-tour-recipe.mjs` does that when the catalog is empty) or a changed normalisation
 * rule all leave terms missing or stale. This sweep heals all of that, so it runs after
 * every seed step (`db:setup`, the deploy and E2E workflows).
 *
 * Idempotent and complete: replaces the terms of every ingredient, including the ones
 * users created. ~6 rows per ingredient, so a few thousand ingredients are a dozen batched
 * statements inside one transaction — seconds, not minutes, even against the remote
 * production host.
 *
 * Usage:
 *   node scripts/rebuild-search-terms.mjs            # rebuild
 *   node scripts/rebuild-search-terms.mjs --dry-run  # count what would be written, no DB writes
 */

import { createConnection } from 'mysql2/promise'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { searchTermsForIngredient } from '../shared/utils/ingredientSearch.ts'
import { asJson, writeSearchTerms } from './lib/search-terms.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDryRun = process.argv.includes('--dry-run')

// ── Load .env ────────────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const envPath = resolve(__dirname, '../.env')
    const lines = readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* rely on environment */
  }
}
loadEnv()

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.')
  process.exit(1)
}

async function main() {
  const conn = await createConnection(process.env.DATABASE_URL)
  try {
    const [rows] = await conn.query('SELECT id, name, name_translations, synonyms FROM ingredients ORDER BY id')
    console.log(`Loaded ${rows.length} ingredients.`)

    if (isDryRun) {
      let termCount = 0
      for (const row of rows) {
        termCount += searchTermsForIngredient({
          name: row.name,
          nameTranslations: asJson(row.name_translations, {}),
          synonyms: asJson(row.synonyms, {}),
        }).length
      }
      console.log(`DRY-RUN: would write ${termCount} search terms for ${rows.length} ingredients.`)
      return
    }

    await conn.beginTransaction()
    let written
    try {
      written = await writeSearchTerms(conn, rows)
      await conn.commit()
    } catch (err) {
      await conn.rollback()
      throw err
    }

    console.log(`✓ Wrote ${written} search terms for ${rows.length} ingredients.`)
  } finally {
    await conn.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
