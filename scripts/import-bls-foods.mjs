/**
 * Import the German Bundeslebensmittelschlüssel (BLS) 4.0 into the GourMerge ingredient
 * catalog — next to the Swiss BLV data, not instead of it (docs/BLS-INTEGRATION-PLAN.md).
 *
 * Two sources, one importer, same shape as import-swiss-foods.mjs:
 *
 *   1. The committed seed file (DEFAULT) — `server/database/seeds/bls-foods.jsonl`.
 *      What contributors and the deploy use: no XLSX, no `xlsx` dependency.
 *
 *   2. The MRI's spreadsheet — for regenerating that seed. Not in the repo (`.claude/` is
 *      gitignored); download the German ZIP from https://blsdb.de/bls and put
 *      `BLS_4_0_Daten_2025_DE.xlsx` into `.claude/data/bls/`. The English ZIP is the same
 *      data with English headers, so one file is enough.
 *
 * What the seed is made of (all committed, all in server/database/seeds/):
 *   bls-map.csv         decisions: which BLS codes are the same ingredient as a Swiss food
 *                       (`same`), which dish-group codes are ingredients after all (`new`),
 *                       and which are left out (`skip`). Everything else in groups B–W is new.
 *   bls-i18n.jsonl      FR/IT names for every imported code — the BLS itself has only DE/EN.
 *   bls-4.0-errata.json the MRI's published corrections, applied on the way in.
 *
 * Usage:
 *   node scripts/import-bls-foods.mjs                          # seed file → DB
 *   node scripts/import-bls-foods.mjs --dry-run                # parse only, no DB writes
 *   node scripts/import-bls-foods.mjs --force                  # re-import even if the count says done
 *   node scripts/import-bls-foods.mjs --from-xlsx --emit-seed  # spreadsheet + map + i18n → seed file
 *   node scripts/import-bls-foods.mjs --from-xlsx --emit-review <dir>
 *                                                              # spreadsheet → review material for the
 *                                                              # matching/translation pass, no DB
 *
 * Runs AFTER seed:swiss: a `same` row attaches a BLS code to the Swiss ingredient and gives
 * it the German (BLS) display name, keeping the Swiss nutrition values and the Swiss
 * FR/IT names. Idempotent: keyed by ingredient_sources (dataset='bls', external_id=code).
 */

import { createConnection } from 'mysql2/promise'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { asJson, writeSearchTerms } from './lib/search-terms.mjs'
import {
  DATASET,
  DATASET_VERSION,
  NUTRITION_SOURCE,
  categoryForCode,
  decisionFor,
  isDishGroup,
  mapNutrition,
  parseMap,
  parseValue,
} from './lib/bls.mjs'
import { normalizeSearchTerm } from '../shared/utils/ingredientSearch.ts'
import { INGREDIENT_VOCABULARY } from '../shared/utils/ingredientVocabulary.ts'

async function loadXlsx() {
  try {
    const mod = await import('xlsx')
    return mod.default ?? mod
  } catch {
    console.error('The --from-xlsx path needs the `xlsx` package: npm i -D xlsx')
    process.exit(1)
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DATA_FILE = resolve(ROOT, '.claude/data/bls/BLS_4_0_Daten_2025_DE.xlsx')
const SEEDS = resolve(ROOT, 'server/database/seeds')
const SEED_FILE = resolve(SEEDS, 'bls-foods.jsonl')
const MAP_FILE = resolve(SEEDS, 'bls-map.csv')
const I18N_FILE = resolve(SEEDS, 'bls-i18n.jsonl')
const ERRATA_FILE = resolve(SEEDS, 'bls-4.0-errata.json')
const SWISS_SEED = resolve(SEEDS, 'swiss-foods.jsonl')

const isDryRun = process.argv.includes('--dry-run')
const fromXlsx = process.argv.includes('--from-xlsx')
const emitSeed = process.argv.includes('--emit-seed')
const reviewArg = process.argv.indexOf('--emit-review')
const REVIEW_DIR = reviewArg >= 0 ? resolve(process.argv[reviewArg + 1]) : null
const FORCE = process.argv.includes('--force')
const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : Infinity
/** Foods per multi-row statement. */
const BATCH = 200

// ── Load .env ────────────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const lines = readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* rely on environment */
  }
}
loadEnv()

const needsDb = !emitSeed && !REVIEW_DIR && !isDryRun
if (needsDb && !process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.')
  process.exit(1)
}

// ── Spreadsheet ──────────────────────────────────────────────────────────────

/**
 * Columns: A code, B German name, C English name, then (value, Datenherkunft, Referenz)
 * per component, the component code being the first token of the value header
 * ("ENERCC Energie (Kilokalorien) [kcal/100g]"). Last column: a free-text Hinweis.
 */
function parseXlsx(XLSX) {
  if (!existsSync(DATA_FILE)) {
    console.error(`Cannot read ${DATA_FILE}.`)
    console.error('Download the German ZIP from https://blsdb.de/bls and put the data file there.')
    process.exit(1)
  }
  console.log('Parsing the spreadsheet (14 MB, this takes a moment)…')
  const wb = XLSX.readFile(DATA_FILE, { cellDates: false })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null })
  const header = rows[0]
  const componentCols = []
  for (let i = 3; i < header.length; i++) {
    const h = header[i]
    if (typeof h !== 'string') continue
    if (/ Datenherkunft$| Referenz$| Data origin$| Reference$/.test(h) || h === 'Hinweis' || h === 'Note') continue
    componentCols.push([h.split(' ')[0], i])
  }
  if (componentCols.length !== 138) throw new Error(`Expected 138 components, found ${componentCols.length}`)

  const foods = []
  for (const r of rows.slice(1)) {
    const code = r[0]
    if (!code || typeof code !== 'string') continue
    const values = {}
    for (const [comp, i] of componentCols) values[comp] = r[i]
    foods.push({ code: code.trim(), de: String(r[1]).trim(), en: String(r[2]).trim(), values })
  }
  console.log(`  → ${foods.length} foods, ${componentCols.length} components`)
  return foods
}

// ── Review material (for the matching + translation pass) ────────────────────

const PREP_WORDS = new Set(
  [
    'roh',
    'raw',
    'gekocht',
    'boiled',
    'cooked',
    'gebraten',
    'fried',
    'gebacken',
    'baked',
    'gedunstet',
    'steamed',
    'gedampft',
    'getrocknet',
    'dried',
    'konserve',
    'canned',
    'gegrillt',
    'grilled',
    'gerostet',
    'roasted',
    'tiefgefroren',
    'frozen',
    'geraucht',
    'smoked',
    'geschmort',
    'stewed',
    'abgetropft',
    'drained',
    'frittiert',
    'pochiert',
    'poached',
  ].map(normalizeSearchTerm)
)
const STOP = new Set([
  'und',
  'mit',
  'ohne',
  'of',
  'the',
  'and',
  'with',
  'without',
  'in',
  'i',
  'tr',
  'mind',
  'min',
  'fett',
  'fat',
])

function tokens(...names) {
  const vocab = INGREDIENT_VOCABULARY.map(([a, b]) => [normalizeSearchTerm(a), normalizeSearchTerm(b)])
  const words = new Set()
  for (const name of names) {
    for (const w of normalizeSearchTerm(name ?? '').split(' ')) {
      if (!w || STOP.has(w) || PREP_WORDS.has(w) || w.length < 2) continue
      words.add(w)
      for (const [a, b] of vocab) {
        if (w === a) for (const x of b.split(' ')) words.add(x)
        if (w === b) for (const x of a.split(' ')) words.add(x)
      }
    }
  }
  return words
}
function prep(...names) {
  const s = new Set()
  for (const name of names) for (const w of normalizeSearchTerm(name ?? '').split(' ')) if (PREP_WORDS.has(w)) s.add(w)
  return s
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}
const KEY_NUTRIENTS = [
  ['kcal', 'energyKcal', 'ENERCC', 400],
  ['protein', 'protein', 'PROT625', 30],
  ['fat', 'fat', 'FAT', 40],
  ['carbs', 'carbs', 'CHO', 60],
  ['water', 'water', 'WATER', 100],
]
function nutrientDistance(swiss, bls) {
  let sum = 0
  let n = 0
  for (const [, sField, bCode, scale] of KEY_NUTRIENTS) {
    const a = swiss.nutrition[sField]
    const b = parseValue(bls.values[bCode])
    if (a === null || a === undefined || b === null) continue
    sum += Math.abs(a - b) / scale
    n++
  }
  return n ? sum / n : 1
}
function keyNutrients(bls) {
  return Object.fromEntries(KEY_NUTRIENTS.map(([k, , code]) => [k, parseValue(bls.values[code])]))
}

function emitReview(foods, map) {
  mkdirSync(REVIEW_DIR, { recursive: true })

  // The scope, for the translators: every code that will be imported, with the key numbers
  // that help disambiguate ("Milch 1,5 %" vs "3,5 %").
  const scope = foods.filter((f) => decisionFor(f.code, map).decision !== 'skip')
  const tsv = ['code\tde\ten\tcategory\tkcal\tprotein\tfat\tcarbs\twater']
  for (const f of scope) {
    const k = keyNutrients(f)
    tsv.push([f.code, f.de, f.en, categoryForCode(f.code), k.kcal, k.protein, k.fat, k.carbs, k.water].join('\t'))
  }
  writeFileSync(resolve(REVIEW_DIR, 'bls-scope.tsv'), tsv.join('\n') + '\n')
  console.log(`Wrote ${scope.length} in-scope foods to bls-scope.tsv`)

  // Candidates, for the matchers: per Swiss food the eight most similar BLS foods, by name
  // overlap (both languages, vocabulary applied), agreement on the preparation state and
  // closeness of the five key nutrients. A list to decide from, not a decision.
  const swiss = readFileSync(SWISS_SEED, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
  const blsIndex = scope.map((f) => ({ f, tok: tokens(f.de, f.en), prep: prep(f.de, f.en) }))
  const lines = []
  for (const s of swiss) {
    const tok = tokens(s.names.de, s.names.en)
    const sPrep = prep(s.names.de, s.names.en)
    const scored = []
    for (const b of blsIndex) {
      const j = jaccard(tok, b.tok)
      if (j < 0.2) continue
      const samePrep = sPrep.size === b.prep.size && [...sPrep].every((p) => b.prep.has(p))
      const nd = nutrientDistance(s, b.f)
      scored.push({ score: j * (samePrep ? 1 : 0.8) * Math.max(0.1, 1 - 2 * nd), j, nd, b: b.f })
    }
    scored.sort((a, b) => b.score - a.score)
    lines.push(
      JSON.stringify({
        swissId: s.id,
        de: s.names.de,
        en: s.names.en,
        synonyms: s.synonyms?.de ?? [],
        kcal: s.nutrition.energyKcal,
        protein: s.nutrition.protein,
        fat: s.nutrition.fat,
        carbs: s.nutrition.carbs,
        water: s.nutrition.water,
        candidates: scored.slice(0, 8).map(({ score, b }) => ({
          code: b.code,
          de: b.de,
          en: b.en,
          score: Math.round(score * 100) / 100,
          ...keyNutrients(b),
        })),
      })
    )
  }
  writeFileSync(resolve(REVIEW_DIR, 'swiss-candidates.jsonl'), lines.join('\n') + '\n')
  console.log(`Wrote candidates for ${swiss.length} Swiss foods to swiss-candidates.jsonl`)
}

// ── Seed emission ────────────────────────────────────────────────────────────

function loadI18n() {
  if (!existsSync(I18N_FILE)) return new Map()
  const out = new Map()
  for (const line of readFileSync(I18N_FILE, 'utf8').split('\n')) {
    if (!line.trim()) continue
    const row = JSON.parse(line)
    if (out.has(row.code)) throw new Error(`bls-i18n.jsonl: ${row.code} listed twice`)
    out.set(row.code, row)
  }
  return out
}

function buildSeed(foods, map) {
  const errata = JSON.parse(readFileSync(ERRATA_FILE, 'utf8')).foods
  const i18n = loadI18n()
  const swissIds = new Set(
    readFileSync(SWISS_SEED, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l).id)
  )
  const swissByExternal = new Map(
    readFileSync(SWISS_SEED, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .map((s) => [s.id, s])
  )

  const problems = []
  const usedSwiss = new Map()
  const byCode = new Map(foods.map((f) => [f.code, f]))
  for (const code of map.keys()) if (!byCode.has(code)) problems.push(`bls-map.csv: ${code} is not in the spreadsheet`)

  const out = []
  for (const f of foods) {
    const { decision, target, note } = decisionFor(f.code, map)
    if (decision === 'skip') continue

    const names = { de: f.de, en: f.en }
    const tr = i18n.get(f.code)
    if (tr?.fr) names.fr = tr.fr
    if (tr?.it) names.it = tr.it

    let same = null
    if (decision === 'same') {
      const [kind, id] = target.split(/:(.*)/s)
      if (kind === 'swiss') {
        if (!swissIds.has(id)) problems.push(`${f.code}: same:swiss:${id} — no such Swiss food`)
        if (usedSwiss.has(id)) problems.push(`${f.code}: Swiss ${id} already paired with ${usedSwiss.get(id)}`)
        usedSwiss.set(id, f.code)
        // A pair keeps the Swiss values, so the two must describe the same thing: a kcal gap
        // over 20 % (or 30 kcal) or a fat gap over 5 g is a different food unless the note
        // says why it is not ("ok: …").
        const s = swissByExternal.get(id)
        if (s && !(note ?? '').startsWith('ok:')) {
          const bk = parseValue(f.values.ENERCC)
          const bf = parseValue(f.values.FAT)
          const sk = s.nutrition.energyKcal
          const sf = s.nutrition.fat
          if (bk !== null && sk !== null && Math.abs(bk - sk) > Math.max(30, 0.2 * Math.max(bk, sk))) {
            problems.push(`${f.code} ↔ swiss ${id}: kcal ${bk} vs ${sk}`)
          }
          if (bf !== null && sf !== null && Math.abs(bf - sf) > 5)
            problems.push(`${f.code} ↔ swiss ${id}: fat ${bf} vs ${sf}`)
        }
        same = { dataset: 'swiss-blv', externalId: id }
      } else {
        same = { curated: id }
      }
    } else if (!names.fr || !names.it) {
      problems.push(`${f.code}: no FR/IT name in bls-i18n.jsonl`)
    }

    out.push({
      code: f.code,
      names,
      category: categoryForCode(f.code),
      same,
      nutrition: mapNutrition(f.values, errata[f.code]),
    })
  }

  if (problems.length) {
    console.error(`\n${problems.length} problem(s) — seed not written:`)
    for (const p of problems.slice(0, 50)) console.error('  ' + p)
    if (problems.length > 50) console.error(`  … and ${problems.length - 50} more`)
    process.exit(1)
  }
  return out
}

// ── Database ─────────────────────────────────────────────────────────────────

function ingredientValues(row) {
  return [row.names.en || row.names.de, JSON.stringify(row.names), row.category, '{}']
}

async function upsertNutrition(conn, rows, idByCode) {
  const values = rows
    .filter((row) => row.nutrition)
    .map((row) => {
      const n = row.nutrition
      return [
        idByCode.get(row.code),
        n.energyKcal,
        n.energyKj,
        n.fat,
        n.saturatedFat,
        n.carbs,
        n.sugars,
        n.starch,
        n.fiber,
        n.protein,
        n.salt,
        n.alcohol,
        n.water,
        JSON.stringify(n.micros),
        NUTRITION_SOURCE,
        row.code,
      ]
    })
  if (values.length === 0) return
  await conn.query(
    `INSERT INTO ingredient_nutrition
       (ingredient_id, energy_kcal_100g, energy_kj_100g, fat_100g, saturated_fat_100g,
        carbs_100g, sugars_100g, starch_100g, fiber_100g, protein_100g, salt_100g,
        alcohol_100g, water_100g, micros, source, external_id)
     VALUES ? AS incoming
     ON DUPLICATE KEY UPDATE
       energy_kcal_100g   = incoming.energy_kcal_100g,
       energy_kj_100g     = incoming.energy_kj_100g,
       fat_100g           = incoming.fat_100g,
       saturated_fat_100g = incoming.saturated_fat_100g,
       carbs_100g         = incoming.carbs_100g,
       sugars_100g        = incoming.sugars_100g,
       starch_100g        = incoming.starch_100g,
       fiber_100g         = incoming.fiber_100g,
       protein_100g       = incoming.protein_100g,
       salt_100g          = incoming.salt_100g,
       alcohol_100g       = incoming.alcohol_100g,
       water_100g         = incoming.water_100g,
       micros             = incoming.micros,
       source             = incoming.source,
       external_id        = incoming.external_id`,
    [values]
  )
}

/**
 * Attach a BLS code to an ingredient that already exists — a Swiss food, or a curated row —
 * and give it the German display name (decision E5 in the plan): `name_translations.de`
 * becomes the BLS name, the previous German name and the BLS English name go into
 * `synonyms`, everything else (nutrition, FR/IT, canonical EN name) stays. Runs on every
 * import, not only the first: the Swiss importer rewrites `name_translations` from its own
 * seed whenever it runs, and this is what puts the German name back.
 */
async function applyPairs(conn, pairs, idByCode) {
  const swissIdByExternal = new Map(
    (
      await conn.execute(`SELECT external_id, ingredient_id FROM ingredient_sources WHERE dataset = 'swiss-blv'`)
    )[0].map((r) => [String(r.external_id), r.ingredient_id])
  )
  const targets = new Map() // code → ingredient id
  const unresolved = []
  for (const row of pairs) {
    if (row.same.dataset === 'swiss-blv') {
      const id = swissIdByExternal.get(row.same.externalId)
      if (!id) throw new Error(`${row.code}: Swiss food ${row.same.externalId} is not imported — run seed:swiss first`)
      targets.set(row.code, id)
    } else {
      const [found] = await conn.execute(
        `SELECT i.id FROM ingredients i LEFT JOIN ingredient_sources s ON s.ingredient_id = i.id
          WHERE LOWER(i.name) = LOWER(?) AND i.created_by IS NULL AND s.id IS NULL LIMIT 1`,
        [row.same.curated]
      )
      if (found.length) targets.set(row.code, found[0].id)
      else unresolved.push(row)
    }
  }

  if (targets.size > 0) {
    const ids = [...new Set(targets.values())]
    const [current] = await conn.query(
      `SELECT id, name, name_translations, synonyms FROM ingredients WHERE id IN (?)`,
      [ids]
    )
    const byId = new Map(current.map((r) => [r.id, r]))
    const updates = []
    const termRows = []
    for (const row of pairs) {
      const id = targets.get(row.code)
      if (!id) continue
      const cur = byId.get(id)
      const translations = asJson(cur.name_translations, {})
      const synonyms = asJson(cur.synonyms, {})
      const addSyn = (locale, value) => {
        if (!value) return
        const list = Array.isArray(synonyms[locale]) ? synonyms[locale] : []
        const norm = normalizeSearchTerm(value)
        if (norm === normalizeSearchTerm(translations[locale] ?? '')) return
        if (list.some((s) => normalizeSearchTerm(s) === norm)) return
        synonyms[locale] = [...list, value]
      }
      if (translations.de && translations.de !== row.names.de) addSyn('de', translations.de)
      translations.de = row.names.de
      addSyn('en', row.names.en)
      // Only when the row had none: a curated row with no FR/IT gets the BLS translations.
      for (const l of ['fr', 'it']) if (!translations[l] && row.names[l]) translations[l] = row.names[l]
      updates.push([id, cur.name, JSON.stringify(translations), JSON.stringify(synonyms)])
      termRows.push({ id, name: cur.name, name_translations: translations, synonyms })
      idByCode.set(row.code, id)
    }
    await conn.query(
      `INSERT INTO ingredients (id, name, name_translations, synonyms) VALUES ? AS incoming
       ON DUPLICATE KEY UPDATE name_translations = incoming.name_translations, synonyms = incoming.synonyms`,
      [updates]
    )
    await conn.query(
      `INSERT IGNORE INTO ingredient_sources (ingredient_id, dataset, external_id, dataset_version) VALUES ?`,
      [pairs.filter((r) => targets.has(r.code)).map((r) => [targets.get(r.code), DATASET, r.code, DATASET_VERSION])]
    )
    await conn.query(`UPDATE ingredient_sources SET dataset_version = ? WHERE dataset = ? AND external_id IN (?)`, [
      DATASET_VERSION,
      DATASET,
      [...targets.keys()],
    ])
    await writeSearchTerms(conn, termRows)
  }
  return { attached: targets.size, unresolved }
}

async function importToDb(seed) {
  const conn = await createConnection(process.env.DATABASE_URL)
  try {
    const foods = LIMIT === Infinity ? seed : seed.slice(0, LIMIT)
    const [sourceRows] = await conn.execute(
      `SELECT external_id, ingredient_id, dataset_version FROM ingredient_sources WHERE dataset = ?`,
      [DATASET]
    )
    const idByCode = new Map(sourceRows.map((r) => [String(r.external_id), r.ingredient_id]))
    const atVersion = sourceRows.filter((r) => r.dataset_version === DATASET_VERSION).length

    await conn.beginTransaction()
    try {
      // Pairs first and always (cheap, and see applyPairs for why every run).
      const pairs = foods.filter((row) => row.same)
      const { attached, unresolved } = await applyPairs(conn, pairs, idByCode)
      console.log(
        `${attached} BLS codes attached to existing ingredients${unresolved.length ? `, ${unresolved.length} curated targets not found (imported as new)` : ''}.`
      )

      let newRows = foods.filter((row) => !row.same)
      newRows = newRows.concat(unresolved)

      if (!FORCE && LIMIT === Infinity && atVersion === foods.length) {
        console.log(`✓ ${atVersion} BLS foods already imported (${DATASET} ${DATASET_VERSION}) — nothing else to do.`)
        console.log('  Re-import anyway with --force.')
        await conn.commit()
        return
      }

      const toInsert = newRows.filter((row) => !idByCode.has(row.code))
      const toUpdate = newRows.filter((row) => idByCode.has(row.code))
      console.log(`${toInsert.length} new, ${toUpdate.length} existing — writing in batches of ${BATCH}…`)
      let written = 0
      const progress = () => process.stdout.write(`  ${written}/${newRows.length}...\r`)

      for (let i = 0; i < toInsert.length; i += BATCH) {
        const batch = toInsert.slice(i, i + BATCH)
        const [result] = await conn.query(
          `INSERT INTO ingredients (name, name_translations, category, synonyms) VALUES ?`,
          [batch.map(ingredientValues)]
        )
        if (result.affectedRows !== batch.length) {
          throw new Error(`Expected ${batch.length} inserted ingredients, got ${result.affectedRows}`)
        }
        batch.forEach((row, k) => idByCode.set(row.code, result.insertId + k))
        await conn.query(
          `INSERT INTO ingredient_sources (ingredient_id, dataset, external_id, dataset_version) VALUES ?`,
          [batch.map((row) => [idByCode.get(row.code), DATASET, row.code, DATASET_VERSION])]
        )
        await upsertNutrition(conn, batch, idByCode)
        await writeSearchTerms(
          conn,
          batch.map((row) => ({
            id: idByCode.get(row.code),
            name: ingredientValues(row)[0],
            name_translations: row.names,
            synonyms: {},
          }))
        )
        written += batch.length
        progress()
      }

      for (let i = 0; i < toUpdate.length; i += BATCH) {
        const batch = toUpdate.slice(i, i + BATCH)
        await conn.query(
          `INSERT INTO ingredients (id, name, name_translations, category, synonyms) VALUES ? AS incoming
           ON DUPLICATE KEY UPDATE
             name = incoming.name,
             name_translations = incoming.name_translations,
             category = incoming.category`,
          [batch.map((row) => [idByCode.get(row.code), ...ingredientValues(row)])]
        )
        await upsertNutrition(conn, batch, idByCode)
        const [current] = await conn.query(
          `SELECT id, name, name_translations, synonyms FROM ingredients WHERE id IN (?)`,
          [batch.map((row) => idByCode.get(row.code))]
        )
        await writeSearchTerms(conn, current)
        written += batch.length
        progress()
      }
      if (toUpdate.length > 0) {
        await conn.query(`UPDATE ingredient_sources SET dataset_version = ? WHERE dataset = ? AND external_id IN (?)`, [
          DATASET_VERSION,
          DATASET,
          toUpdate.map((row) => row.code),
        ])
      }
      await conn.commit()
      console.log(
        `\n✓ Imported ${toInsert.length} new + updated ${toUpdate.length} existing ingredients, ${attached} attached.`
      )
    } catch (err) {
      await conn.rollback()
      throw err
    }
  } finally {
    await conn.end()
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('GourMerge BLS 4.0 Importer\n')
  const map = existsSync(MAP_FILE) ? parseMap(readFileSync(MAP_FILE, 'utf8')) : new Map()

  if (fromXlsx) {
    const XLSX = await loadXlsx()
    const foods = parseXlsx(XLSX)
    if (REVIEW_DIR) {
      emitReview(foods, map)
      return
    }
    const seed = buildSeed(foods, map)
    if (emitSeed) {
      mkdirSync(SEEDS, { recursive: true })
      writeFileSync(SEED_FILE, seed.map((row) => JSON.stringify(row)).join('\n') + '\n')
      const kb = (readFileSync(SEED_FILE).length / 1024).toFixed(0)
      const pairs = seed.filter((r) => r.same).length
      console.log(`Wrote ${seed.length} foods (${pairs} paired with existing ingredients) to ${SEED_FILE} (${kb} KB).`)
      return
    }
    console.error('--from-xlsx needs --emit-seed or --emit-review <dir>.')
    process.exit(1)
  }

  let seed
  try {
    seed = readFileSync(SEED_FILE, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l))
  } catch (err) {
    console.error(`Cannot read the seed file at ${SEED_FILE}`)
    console.error(err.code === 'ENOENT' ? 'It is missing from this checkout.' : err.message)
    process.exit(1)
  }
  console.log(`Loaded ${seed.length} foods from the committed seed file.\n`)

  if (isDryRun) {
    for (const row of seed.slice(0, 5)) {
      console.log(
        `  [${row.code}] "${row.names.en}" — cat: ${row.category} — kcal: ${row.nutrition?.energyKcal ?? '–'}${row.same ? ` — same as ${JSON.stringify(row.same)}` : ''}`
      )
    }
    const skipped = seed.filter((r) => isDishGroup(r.code)).length
    console.log(
      `\nDRY-RUN complete — ${seed.length} foods would be imported (${skipped} of them from the dish groups X/Y).`
    )
    return
  }

  await importToDb(seed)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
