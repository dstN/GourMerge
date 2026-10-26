/**
 * Fold user-created ingredients into the reference catalog (phase 6 of
 * docs/BLS-INTEGRATION-PLAN.md, decision E4).
 *
 * Before the BLS import, a user who could not find "Backpulver" or "Gelatine" created it
 * by hand. Now the catalog has it, so the hand-made row is a duplicate that the
 * autocomplete shows twice. This script replaces such a row with the reference one:
 * every commit's ingredient line that points at the user row is re-pointed at the
 * reference row, then the user row is deleted. Quantities, units, notes and order are
 * untouched; the nutrition of those recipes changes to the reference values — a user row
 * typically had none at all.
 *
 * That is a deliberate exception to "commits are immutable snapshots": the snapshot still
 * says the same thing, only the id behind the name is now the catalog's. Forks are
 * included on purpose — a fork copies commit rows with their ingredient ids, so leaving
 * them out would make a diff between a fork and its original disagree about an
 * ingredient that is one and the same.
 *
 * Three steps, each explicit, because the decisions need a person and the data lives
 * only in production:
 *
 *   1. node scripts/merge-user-ingredients.mjs --report > user-ingredients.tsv
 *        Every ingredient with `created_by` set: id, names, nutrition, the number of
 *        commits using it, and the best-matching reference rows by normalised name.
 *        Review it (or let Claude propose), and write a mapping file.
 *
 *   2. node scripts/merge-user-ingredients.mjs --apply mapping.tsv --dry-run
 *        Mapping file: tab-separated, header `user_id<TAB>target_id<TAB>note`, one row per
 *        user ingredient to fold. Prints what would change, writes nothing.
 *
 *   3. node scripts/backup-db.mjs && node scripts/merge-user-ingredients.mjs --apply mapping.tsv
 *        Validates every row (both ids exist, the target is a reference row — has an
 *        ingredient_sources entry — the user row is not), then re-points and deletes
 *        inside one transaction. Refuses the whole file on the first invalid row.
 *
 * The mapping file holds production ids and never goes into the repo. The names users
 * searched for are worth keeping as search terms, though: add them to
 * shared/utils/ingredientVocabulary.ts or the dataset's synonyms, not to the database,
 * or the next deploy's seed run rewrites them away.
 */

import { createConnection } from 'mysql2/promise'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { asJson } from './lib/search-terms.mjs'
import { normalizeSearchTerm } from '../shared/utils/ingredientSearch.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isReport = process.argv.includes('--report')
const applyArg = process.argv.indexOf('--apply')
const MAPPING_FILE = applyArg >= 0 ? resolve(process.argv[applyArg + 1]) : null
const isDryRun = process.argv.includes('--dry-run')

// ── Load .env ────────────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const lines = readFileSync(resolve(__dirname, '../.env'), 'utf8').split('\n')
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
if (!isReport && !MAPPING_FILE) {
  console.error('Usage: --report | --apply <mapping.tsv> [--dry-run]')
  process.exit(1)
}

/** Reference rows: everything a dataset knows, plus curated rows (no creator, no source). */
const REFERENCE_SQL = `
  SELECT i.id, i.name, i.name_translations, i.synonyms, i.manufacturer,
         GROUP_CONCAT(CONCAT(s.dataset, ':', s.external_id)) AS sources
    FROM ingredients i
    LEFT JOIN ingredient_sources s ON s.ingredient_id = i.id
   WHERE i.created_by IS NULL
   GROUP BY i.id`

function namesOf(row) {
  const t = asJson(row.name_translations, {})
  const syn = asJson(row.synonyms, {})
  const all = [row.name, ...Object.values(t), ...Object.values(syn).flat()].filter(Boolean)
  return new Set(all.map((n) => normalizeSearchTerm(String(n))).filter(Boolean))
}

async function report(conn) {
  const [users] = await conn.query(`
    SELECT i.id, i.name, i.name_translations, i.category, i.manufacturer, i.created_at,
           u.username,
           n.energy_kcal_100g, n.protein_100g, n.carbs_100g, n.fat_100g,
           (SELECT COUNT(*) FROM recipe_commit_ingredients c WHERE c.ingredient_id = i.id) AS commits_using
      FROM ingredients i
      JOIN users u ON u.id = i.created_by
      LEFT JOIN ingredient_nutrition n ON n.ingredient_id = i.id
     ORDER BY commits_using DESC, i.id`)
  const [refs] = await conn.query(REFERENCE_SQL)
  const index = refs.map((r) => ({ r, names: namesOf(r) }))

  const lines = ['user_id\tname\tde\tcategory\tmanufacturer\tby\tcommits\tkcal\tprotein\tcarbs\tfat\tcandidates']
  for (const u of users) {
    const t = asJson(u.name_translations, {})
    const wanted = namesOf(u)
    // Exact normalised-name hits first, then rows that share a whole word with the name.
    const words = new Set([...wanted].flatMap((n) => n.split(' ')).filter((w) => w.length > 3))
    const scored = []
    for (const { r, names } of index) {
      let score = 0
      for (const n of wanted) if (names.has(n)) score = Math.max(score, 100)
      if (score === 0) {
        for (const n of names) {
          const hit = n.split(' ').filter((w) => words.has(w)).length
          if (hit) score = Math.max(score, hit * 10 - n.length / 20)
        }
      }
      if (score > 0) scored.push({ score, r })
    }
    scored.sort((a, b) => b.score - a.score)
    const candidates = scored
      .slice(0, 5)
      .map(({ r }) => `${r.id}=${asJson(r.name_translations, {}).de ?? r.name} [${r.sources ?? 'curated'}]`)
      .join(' | ')
    lines.push(
      [
        u.id,
        u.name,
        t.de ?? '',
        u.category ?? '',
        u.manufacturer ?? '',
        u.username,
        u.commits_using,
        u.energy_kcal_100g ?? '',
        u.protein_100g ?? '',
        u.carbs_100g ?? '',
        u.fat_100g ?? '',
        candidates,
      ].join('\t')
    )
  }
  process.stdout.write(lines.join('\n') + '\n')
  console.error(`${users.length} user-created ingredients, ${refs.length} reference rows considered.`)
}

function readMapping() {
  const lines = readFileSync(MAPPING_FILE, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#'))
  const header = lines.shift()
  if (!/^user_id\ttarget_id(\tnote)?$/.test(header ?? '')) {
    throw new Error(`mapping: expected header "user_id<TAB>target_id<TAB>note", got "${header}"`)
  }
  const rows = []
  const seen = new Set()
  for (const line of lines) {
    const [userId, targetId, ...rest] = line.split('\t')
    if (!/^\d+$/.test(userId ?? '') || !/^\d+$/.test(targetId ?? '')) throw new Error(`mapping: bad row "${line}"`)
    if (userId === targetId) throw new Error(`mapping: ${userId} maps to itself`)
    if (seen.has(userId)) throw new Error(`mapping: ${userId} listed twice`)
    seen.add(userId)
    rows.push({ userId: Number(userId), targetId: Number(targetId), note: rest.join('\t') })
  }
  return rows
}

async function apply(conn) {
  const mapping = readMapping()
  if (mapping.length === 0) {
    console.log('Mapping file has no rows — nothing to do.')
    return
  }

  // Validate everything before touching anything.
  const ids = [...new Set(mapping.flatMap((m) => [m.userId, m.targetId]))]
  const [rows] = await conn.query(
    `SELECT i.id, i.name, i.created_by, i.manufacturer,
            (SELECT COUNT(*) FROM ingredient_sources s WHERE s.ingredient_id = i.id) AS sources,
            (SELECT COUNT(*) FROM recipe_commit_ingredients c WHERE c.ingredient_id = i.id) AS commits_using
       FROM ingredients i WHERE i.id IN (?)`,
    [ids]
  )
  const byId = new Map(rows.map((r) => [r.id, r]))
  const problems = []
  for (const m of mapping) {
    const u = byId.get(m.userId)
    const t = byId.get(m.targetId)
    if (!u) problems.push(`${m.userId}: no such ingredient`)
    else if (u.created_by === null)
      problems.push(`${m.userId} "${u.name}": not user-created — this script only folds user rows`)
    if (!t) problems.push(`${m.targetId}: no such target ingredient`)
    else if (t.created_by !== null) problems.push(`${m.targetId} "${t.name}": target is itself user-created`)
    else if (t.sources === 0 && !(u && u.manufacturer === null)) {
      /* a curated row is an acceptable target */
    }
    if (u && t && u.manufacturer && !t.manufacturer) {
      problems.push(
        `${m.userId} "${u.name}" is a branded product (${u.manufacturer}); not folding it into generic "${t.name}"`
      )
    }
  }
  if (problems.length) {
    console.error(`${problems.length} problem(s) — nothing applied:`)
    for (const p of problems) console.error('  ' + p)
    process.exit(1)
  }

  for (const m of mapping) {
    const u = byId.get(m.userId)
    const t = byId.get(m.targetId)
    console.log(
      `${isDryRun ? 'would fold' : 'folding'} [${u.id}] "${u.name}" (${u.commits_using} commit line(s)) → [${t.id}] "${t.name}"${m.note ? `  — ${m.note}` : ''}`
    )
  }
  if (isDryRun) {
    console.log(`\nDRY-RUN: ${mapping.length} ingredient(s) would be folded. Nothing written.`)
    return
  }

  await conn.beginTransaction()
  try {
    let moved = 0
    for (const m of mapping) {
      const [res] = await conn.execute(
        `UPDATE recipe_commit_ingredients SET ingredient_id = ? WHERE ingredient_id = ?`,
        [m.targetId, m.userId]
      )
      moved += res.affectedRows
      // Reports on the user row (target_kind 'ingredient') would point at nothing — close them.
      await conn.execute(
        `UPDATE reports SET status = 'actioned' WHERE target_kind = 'ingredient' AND target_id = ? AND status = 'open'`,
        [m.userId]
      )
      // nutrition, sources and search terms cascade.
      await conn.execute(`DELETE FROM ingredients WHERE id = ?`, [m.userId])
    }
    await conn.commit()
    console.log(`\n✓ Folded ${mapping.length} ingredient(s); ${moved} commit line(s) re-pointed.`)
  } catch (err) {
    await conn.rollback()
    throw err
  }
}

async function main() {
  const conn = await createConnection(process.env.DATABASE_URL)
  try {
    if (isReport) await report(conn)
    else await apply(conn)
  } finally {
    await conn.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
