/**
 * Remove test/seed ingredients from the DB that were added by seed-ingredients.mjs
 * but have no Swiss BLV nutrition data.
 *
 * Safe: ingredients referenced by any recipe commit are skipped (never deleted).
 *
 * Usage:
 *   node scripts/cleanup-seed-ingredients.mjs           (dry-run, shows what would be deleted)
 *   node scripts/cleanup-seed-ingredients.mjs --execute  (actually deletes)
 *
 * Requires DATABASE_URL to be set (e.g. via .env or shell).
 */

import { createConnection } from 'mysql2/promise'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isExecute = process.argv.includes('--execute')

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

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.')
  process.exit(1)
}

const conn = await createConnection(DATABASE_URL)

try {
  // Ingredients with no Swiss BLV nutrition entry (seeded manually, no data source)
  const [candidates] = await conn.execute(`
    SELECT i.id, i.name
    FROM ingredients i
    LEFT JOIN ingredient_nutrition n
      ON n.ingredient_id = i.id AND n.source = 'swiss-blv-v7'
    WHERE n.ingredient_id IS NULL
    ORDER BY i.name
  `)

  if (candidates.length === 0) {
    console.log('Nothing to clean up — all ingredients have Swiss BLV nutrition data.')
    process.exit(0)
  }

  console.log(`Found ${candidates.length} ingredient(s) without Swiss BLV data:\n`)

  const safe = []
  const referenced = []

  for (const row of candidates) {
    const [refs] = await conn.execute('SELECT COUNT(*) AS cnt FROM recipe_commit_ingredients WHERE ingredient_id = ?', [
      row.id,
    ])
    if (refs[0].cnt > 0) {
      referenced.push({ ...row, usedIn: refs[0].cnt })
    } else {
      safe.push(row)
    }
  }

  if (safe.length > 0) {
    console.log(`Will ${isExecute ? 'DELETE' : 'dry-run DELETE'} (not referenced in any recipe):`)
    for (const r of safe) console.log(`  [${r.id}] ${r.name}`)
    console.log()
  }

  if (referenced.length > 0) {
    console.log('Skipping (referenced in recipes — manual cleanup required):')
    for (const r of referenced) console.log(`  [${r.id}] ${r.name}  (used in ${r.usedIn} commit ingredient row(s))`)
    console.log()
  }

  if (!isExecute) {
    console.log('Dry-run complete. Pass --execute to apply deletions.')
    process.exit(0)
  }

  if (safe.length === 0) {
    console.log('Nothing to delete — all candidates are referenced in recipes.')
    process.exit(0)
  }

  const ids = safe.map((r) => r.id)
  const placeholders = ids.map(() => '?').join(',')
  await conn.execute(`DELETE FROM ingredients WHERE id IN (${placeholders})`, ids)
  console.log(`✓ Deleted ${safe.length} ingredient(s).`)
} finally {
  await conn.end()
}
