/**
 * GourMerge — Counter Reconcile Script (P3-010)
 *
 * Recomputes denormalized starCount + forkCount on every recipe by counting
 * real rows in recipe_stars and recipes (forkedFromRecipeId) respectively.
 *
 * Run manually or as a scheduled job:
 *   node scripts/reconcile-counters.mjs
 *
 * Safe to run on a live production DB — uses UPDATE ... WHERE to skip unchanged rows.
 */

import { createConnection } from 'mysql2/promise'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

async function main() {
  const conn = await createConnection(DATABASE_URL)
  console.log('Connected. Reconciling counters...')

  // ── Star counts ─────────────────────────────────────────
  const [starResult] = await conn.execute(`
    UPDATE recipes r
    SET star_count = (
      SELECT COUNT(*) FROM recipe_stars rs WHERE rs.recipe_id = r.id
    )
    WHERE star_count != (
      SELECT COUNT(*) FROM recipe_stars rs WHERE rs.recipe_id = r.id
    )
  `)
  console.log(`star_count: updated ${starResult.affectedRows} recipe(s).`)

  // ── Fork counts ─────────────────────────────────────────
  const [forkResult] = await conn.execute(`
    UPDATE recipes r
    SET fork_count = (
      SELECT COUNT(*) FROM recipes f WHERE f.forked_from_recipe_id = r.id
    )
    WHERE fork_count != (
      SELECT COUNT(*) FROM recipes f WHERE f.forked_from_recipe_id = r.id
    )
  `)
  console.log(`fork_count: updated ${forkResult.affectedRows} recipe(s).`)

  await conn.end()
  console.log('Reconciliation complete.')
}

main().catch((err) => {
  console.error('Reconcile failed:', err)
  process.exit(1)
})
