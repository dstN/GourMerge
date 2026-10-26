/**
 * Import Swiss BLV Food Composition Database V7.0 into the GourMerge ingredient catalog.
 *
 * Two sources, one importer:
 *
 *   1. The committed seed file (DEFAULT) — `server/database/seeds/swiss-foods.jsonl`.
 *      This is what contributors use. No XLSX, no `xlsx` dependency, no licence
 *      question about redistributing spreadsheets: just `npm run db:seed:swiss`.
 *
 *   2. The original BLV spreadsheets — for regenerating that seed when BLV
 *      publishes a new revision. They are NOT in the repo (`.claude/` is
 *      gitignored); download them from naehrwertdaten.ch into
 *      `.claude/data/swiss/` first.
 *
 * Usage:
 *   node scripts/import-swiss-foods.mjs                    # seed file → DB
 *   node scripts/import-swiss-foods.mjs --dry-run          # parse only, no DB writes
 *   node scripts/import-swiss-foods.mjs --limit 20          # first N rows only
 *   node scripts/import-swiss-foods.mjs --from-xlsx         # spreadsheets → DB
 *   node scripts/import-swiss-foods.mjs --from-xlsx --emit-seed
 *                                                          # spreadsheets → seed file, no DB
 *
 * XLSX files expected by --from-xlsx (joined on the stable numeric ID column):
 *   Schweizer_Nahrwertdatenbank.xlsx                     (de — required)
 *   Swiss_food_composition_database.xlsx                 (en)
 *   Base_de_donnees_suisse_des_valeurs_nutritives.xlsx   (fr)
 *   Banca_dati_svizzera_dei_valori_nutritivi.xlsx        (it)
 *
 * Upserts `ingredients` (canonical EN name when available, else DE), `ingredient_nutrition`,
 * `ingredient_sources` and the ingredient's search terms. Idempotent: a food is looked up by
 * (dataset='swiss-blv', external_id) — the version lives in `ingredient_sources.dataset_version`
 * and is bumped in place, so a new BLV release updates these rows rather than duplicating them.
 * Writes in multi-row batches inside one transaction (three statements per food took a quarter
 * of an hour against the production host).
 */

import { createConnection } from 'mysql2/promise'
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeSearchTerms } from './lib/search-terms.mjs'

// `xlsx` is imported lazily inside the --from-xlsx path only. It carries an
// unfixed advisory and is needed solely to regenerate the seed, so the default
// contributor path must not load it (and must work if it is not installed).
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
const DATA_DIR = resolve(ROOT, '.claude/data/swiss')
const SEED_FILE = resolve(ROOT, 'server/database/seeds/swiss-foods.jsonl')
const isDryRun = process.argv.includes('--dry-run')
const fromXlsx = process.argv.includes('--from-xlsx')
const emitSeed = process.argv.includes('--emit-seed')
/** Re-run the import even when the row count says it is already done. */
const FORCE = process.argv.includes('--force')
const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : Infinity

/** `ingredient_sources.dataset` — the family, never versioned (see schema.ts). */
const DATASET = 'swiss-blv'
/** `ingredient_sources.dataset_version` — bump when BLV publishes a new revision. */
const DATASET_VERSION = '7.0'
/** `ingredient_nutrition.source` — the historical marker, kept for every reader of that column. */
const NUTRITION_SOURCE = 'swiss-blv-v7'
/** Foods per multi-row statement. */
const BATCH = 200

// ── Load .env ────────────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const envPath = resolve(ROOT, '.env')
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

// --emit-seed and --dry-run never touch the database.
const needsDb = !emitSeed && !isDryRun
if (needsDb && !process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.')
  process.exit(1)
}

// ── Swiss DB column → field mapping ─────────────────────────────────────────
// Each row has: value col | Herleitung | Quelle  (triplet per nutrient).
// We read only the value column; skip Herleitung/Quelle.
const COL = {
  ID: 'A',
  NAME: 'D',
  SYNONYME: 'E',
  KATEGORIE: 'F',
  DICHTE: 'G',
  // Nutrients (value column only)
  KJ: 'I',
  KCAL: 'L',
  FAT: 'O',
  SAT_FAT: 'R',
  MONO_FAT: 'U',
  POLY_FAT: 'X',
  CHOLESTEROL: 'AM',
  CARBS: 'AP',
  SUGARS: 'AS',
  STARCH: 'AV',
  FIBER: 'AY',
  PROTEIN: 'BB',
  SALT: 'BE',
  ALCOHOL: 'BH',
  WATER: 'BK',
  // Vitamins
  VIT_A_RE: 'BN',
  RETINOL: 'BT',
  BETA_CAROTENE: 'BZ',
  VIT_B1: 'CC',
  VIT_B2: 'CF',
  VIT_B6: 'CI',
  VIT_B12: 'CL',
  NIACIN: 'CO',
  FOLATE: 'CR',
  PANTOTHENIC: 'CU',
  VIT_C: 'CX',
  VIT_D: 'DA',
  VIT_E: 'DD',
  // Minerals
  POTASSIUM: 'DG',
  SODIUM: 'DJ',
  CHLORIDE: 'DM',
  CALCIUM: 'DP',
  MAGNESIUM: 'DS',
  PHOSPHORUS: 'DV',
  IRON: 'DY',
  IODINE: 'EB',
  ZINC: 'EE',
  SELENIUM: 'EH',
}

// Language code detection from the actual Swiss BLV export filenames:
//   Schweizer_Nahrwertdatenbank.xlsx                            → de
//   Swiss_food_composition_database.xlsx                        → en
//   Base_de_donnees_suisse_des_valeurs_nutritives.xlsx          → fr
//   Banca_dati_svizzera_dei_valori_nutritivi.xlsx               → it
function detectLanguage(filename) {
  const name = filename.toLowerCase()
  if (name.startsWith('swiss_') || name.includes('_composition_') || name.includes('_database')) return 'en'
  if (name.startsWith('base_de_') || name.includes('_nutritives') || name.includes('_donnees_')) return 'fr'
  if (name.startsWith('banca_') || name.includes('_nutritivi') || name.includes('_svizzera_')) return 'it'
  return 'de' // default: Schweizer_Nahrwertdatenbank.xlsx
}

// ── Parse a Swiss XLSX file ──────────────────────────────────────────────────
// Sheet name is translated in each language export:
//   DE: Generische Lebensmittel  EN: Generic Foods
//   FR: Aliments génériques      IT: Alimenti generici
const GENERIC_SHEET_NAMES = ['Generische Lebensmittel', 'Generic Foods', 'Aliments génériques', 'Alimenti generici']

function parseXlsx(filePath, XLSX) {
  const wb = XLSX.readFile(filePath, { type: 'buffer', cellDates: false })
  const sheetName = GENERIC_SHEET_NAMES.find((n) => wb.Sheets[n])
  if (!sheetName) throw new Error(`No generic-foods sheet found in ${filePath}. Available: ${wb.SheetNames.join(', ')}`)
  const sheet = wb.Sheets[sheetName]

  const range = XLSX.utils.decode_range(sheet['!ref'])
  const rows = []

  // Row 1 = title banner, Row 2 = header, data starts at Row 3 (index 2)
  for (let r = 2; r <= range.e.r; r++) {
    const get = (col) => {
      const addr = col + (r + 1) // XLSX rows are 1-indexed
      const cell = sheet[addr]
      if (!cell) return null
      const v = cell.v
      if (v === undefined || v === null) return null
      if (typeof v === 'string' && (v.trim() === 'k.A.' || v.trim() === '')) return null
      return v
    }

    const id = get(COL.ID)
    if (!id) continue // skip blank rows
    // The export carries a second header line ("ID", "Name", "Synonyme" …) that once slipped
    // through as food "ID" with the name "Name" — a real ID is numeric.
    if (!/^\d+$/.test(String(id).trim())) continue

    const name = get(COL.NAME)
    if (!name) continue

    rows.push({
      id: String(id),
      name: String(name).trim(),
      synonyme: get(COL.SYNONYME) ? String(get(COL.SYNONYME)).trim() : null,
      kategorie: get(COL.KATEGORIE) ? String(get(COL.KATEGORIE)).trim() : null,
      dichte: parseFloat(get(COL.DICHTE)) || null,
      nutrition: {
        energyKj: numOrNull(get(COL.KJ)),
        energyKcal: numOrNull(get(COL.KCAL)),
        fat: numOrNull(get(COL.FAT)),
        saturatedFat: numOrNull(get(COL.SAT_FAT)),
        carbs: numOrNull(get(COL.CARBS)),
        sugars: numOrNull(get(COL.SUGARS)),
        starch: numOrNull(get(COL.STARCH)),
        fiber: numOrNull(get(COL.FIBER)),
        protein: numOrNull(get(COL.PROTEIN)),
        salt: numOrNull(get(COL.SALT)),
        alcohol: numOrNull(get(COL.ALCOHOL)),
        water: numOrNull(get(COL.WATER)),
        micros: {
          vit_a_re_mcg: numOrNull(get(COL.VIT_A_RE)),
          retinol_mcg: numOrNull(get(COL.RETINOL)),
          beta_carotene_mcg: numOrNull(get(COL.BETA_CAROTENE)),
          vit_b1_mg: numOrNull(get(COL.VIT_B1)),
          vit_b2_mg: numOrNull(get(COL.VIT_B2)),
          vit_b6_mg: numOrNull(get(COL.VIT_B6)),
          vit_b12_mcg: numOrNull(get(COL.VIT_B12)),
          niacin_mg: numOrNull(get(COL.NIACIN)),
          folate_mcg: numOrNull(get(COL.FOLATE)),
          pantothenic_mg: numOrNull(get(COL.PANTOTHENIC)),
          vit_c_mg: numOrNull(get(COL.VIT_C)),
          vit_d_mcg: numOrNull(get(COL.VIT_D)),
          vit_e_mg: numOrNull(get(COL.VIT_E)),
          potassium_mg: numOrNull(get(COL.POTASSIUM)),
          sodium_mg: numOrNull(get(COL.SODIUM)),
          chloride_mg: numOrNull(get(COL.CHLORIDE)),
          calcium_mg: numOrNull(get(COL.CALCIUM)),
          magnesium_mg: numOrNull(get(COL.MAGNESIUM)),
          phosphorus_mg: numOrNull(get(COL.PHOSPHORUS)),
          iron_mg: numOrNull(get(COL.IRON)),
          iodine_mcg: numOrNull(get(COL.IODINE)),
          zinc_mg: numOrNull(get(COL.ZINC)),
          selenium_mcg: numOrNull(get(COL.SELENIUM)),
        },
      },
    })
  }
  return rows
}

function numOrNull(v) {
  if (v === null || v === undefined) return null
  const n = parseFloat(v)
  return isNaN(n) ? null : Math.round(n * 100) / 100
}

// ── Top-level category extraction ────────────────────────────────────────────
function extractCategory(kategorie) {
  if (!kategorie) return null
  // Kategorie is hierarchical: "Gemüse/Blattgemüse" → "Gemüse"
  return kategorie.split('/')[0].trim()
}

// ── Map Swiss top-level category DE → internal English category key ──────────
const CATEGORY_MAP = {
  // Swiss BLV V7.0 top-level Kategorie values (German)
  'Alkoholhaltige Getränke': 'alcohol',
  'Alkoholfreie Getränke': 'beverage',
  'Brote, Flocken und Frühstückscerealien': 'grain',
  Eier: 'egg',
  'Fette und Öle': 'oil',
  Fisch: 'fish',
  'Fleisch und Innereien': 'meat',
  'Fleisch- und Wurstwaren': 'meat',
  Früchte: 'fruit',
  Gemüse: 'vegetable',
  Gerichte: 'other',
  'Getreideprodukte, Hülsenfrüchte und Kartoffeln': 'grain',
  'Milch und Milchprodukte': 'dairy',
  'Nüsse, Samen und Ölfrüchte': 'nut',
  'Pflanzliche Proteinlieferanten und Alternativen zu tierischen Produkten': 'legume',
  'Salzige Snacks': 'snack',
  Speziallebensmittel: 'other',
  Süssigkeiten: 'sweet',
  Verschiedenes: 'other',
}

function mapCategory(kategorie) {
  const topLevel = extractCategory(kategorie)
  if (!topLevel) return null
  return CATEGORY_MAP[topLevel] || topLevel.toLowerCase()
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('GourMerge Swiss BLV Food Importer V7.0\n')

  let merged

  if (fromXlsx) {
    const XLSX = await loadXlsx()

    // Find all XLSX files in the data directory
    // Sort so DE is always first — category strings (Kategorie) come from DE and are the CATEGORY_MAP keys.
    const LANG_ORDER = { de: 0, en: 1, fr: 2, it: 3 }
    let xlsxFiles
    try {
      xlsxFiles = readdirSync(DATA_DIR)
        .filter((f) => f.toLowerCase().endsWith('.xlsx'))
        .map((f) => ({ file: resolve(DATA_DIR, f), lang: detectLanguage(f) }))
        .sort((a, b) => (LANG_ORDER[a.lang] ?? 9) - (LANG_ORDER[b.lang] ?? 9))
    } catch {
      console.error(`Cannot read ${DATA_DIR}.`)
      console.error('The BLV spreadsheets are not in the repo. Download them from')
      console.error('naehrwertdaten.ch into .claude/data/swiss/, or drop --from-xlsx')
      console.error('to seed from the committed seed file instead.')
      process.exit(1)
    }

    if (xlsxFiles.length === 0) {
      console.error(`No XLSX files found in ${DATA_DIR}`)
      process.exit(1)
    }

    console.log(`Found ${xlsxFiles.length} language file(s):`)
    xlsxFiles.forEach(({ file, lang }) => console.log(`  [${lang}] ${file.split(/[/\\]/).pop()}`))
    console.log()

    // Parse all language files; primary = first German file
    const byId = {} // id → merged row

    for (const { file, lang } of xlsxFiles) {
      console.log(`Parsing [${lang}]...`)
      const rows = parseXlsx(file, XLSX)
      console.log(`  → ${rows.length} rows`)

      for (const row of rows) {
        if (!byId[row.id]) {
          // Primary entry (nutrition always from DE/first file)
          byId[row.id] = {
            id: row.id,
            names: {},
            synonyms: {},
            kategorie: row.kategorie,
            dichte: row.dichte,
            nutrition: row.nutrition,
          }
        }
        // Add this language's name and synonyms
        byId[row.id].names[lang] = row.name
        if (row.synonyme) {
          byId[row.id].synonyms[lang] = row.synonyme
            .split(';')
            .map((s) => s.trim())
            .filter(Boolean)
        }
      }
    }

    // Stable ordering, so regenerating the seed produces a reviewable diff
    // instead of a reshuffled file.
    merged = Object.values(byId).sort((a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true }))
    console.log(`\nMerged ${merged.length} unique food IDs across all languages.\n`)
  } else {
    try {
      merged = readFileSync(SEED_FILE, 'utf8')
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line))
    } catch (err) {
      console.error(`Cannot read the seed file at ${SEED_FILE}`)
      console.error(err.code === 'ENOENT' ? 'It is missing from this checkout.' : err.message)
      console.error('Regenerate it with: node scripts/import-swiss-foods.mjs --from-xlsx --emit-seed')
      process.exit(1)
    }
    console.log(`Loaded ${merged.length} foods from the committed seed file.\n`)
  }

  if (emitSeed) {
    mkdirSync(dirname(SEED_FILE), { recursive: true })
    // JSON Lines, one food per line: same size as minified JSON but a changed
    // or added food shows up as a one-line diff instead of rewriting the whole
    // file, which matters for a ~1 MB dataset under review.
    writeFileSync(SEED_FILE, merged.map((row) => JSON.stringify(row)).join('\n') + '\n')
    const kb = (readFileSync(SEED_FILE).length / 1024).toFixed(0)
    console.log(`Wrote ${merged.length} foods to ${SEED_FILE} (${kb} KB).`)
    console.log('Commit it so contributors can seed without the spreadsheets.')
    return
  }

  if (isDryRun) {
    const sample = merged.slice(0, 5)
    for (const row of sample) {
      const canonical = row.names.en || row.names.de || `Swiss-${row.id}`
      const cat = mapCategory(row.kategorie)
      console.log(
        `  [${row.id}] "${canonical}" — cat: ${cat} — kcal: ${row.nutrition.energyKcal} — density: ${row.dichte}`
      )
      console.log(`    names: ${JSON.stringify(row.names)}`)
      if (Object.keys(row.synonyms).length > 0) console.log(`    synonyms: ${JSON.stringify(row.synonyms)}`)
    }
    console.log(`\nDRY-RUN complete — ${merged.length} foods would be imported.`)
    return
  }

  const conn = await createConnection(process.env.DATABASE_URL)

  try {
    // ── Skip when the dataset is already in ────────────────────────────────
    //
    // This runs on EVERY deploy, before the artifact swap, against the production MySQL — a
    // separate host, so every statement is real network latency. Measured on the first
    // production deploy: ~1200 foods took a quarter of an hour with one statement per food
    // and column, which is a late place to find out.
    //
    // One COUNT is enough to know there is nothing to do: `ingredient_sources` carries the
    // dataset version per food, so a new BLV release changes `DATASET_VERSION` and this check
    // stops matching by itself. Same version + same row count means the loop has nothing to
    // do.
    //
    // It is a count and not a content hash on purpose. A hash would need somewhere to store
    // it, and the failure it would catch — someone editing the seed file in place without
    // bumping the version — is better solved by `--force`, which is right there.
    if (!FORCE && LIMIT === Infinity) {
      // Counted over the ids the seed carries, so a row that left the seed (the stray header
      // line, once) does not keep this from matching forever.
      const [[{ n }]] = await conn.query(
        `SELECT COUNT(*) AS n FROM ingredient_sources WHERE dataset = ? AND dataset_version = ? AND external_id IN (?)`,
        [DATASET, DATASET_VERSION, merged.map((row) => row.id)]
      )
      if (n === merged.length) {
        console.log(`✓ ${n} Swiss foods already imported (${DATASET} ${DATASET_VERSION}) — nothing to do.`)
        console.log('  Re-import anyway with --force.')
        return
      }
      if (n > 0) console.log(`… ${n} of ${merged.length} present at ${DATASET_VERSION} — continuing (partial import).`)
    }

    const foods = LIMIT === Infinity ? merged : merged.slice(0, LIMIT)

    // ── Which foods are already ingredients ────────────────────────────────
    //
    // Looked up by (dataset, external_id) WITHOUT the version, in one round trip for the
    // whole dataset. The previous importer matched on `ingredient_nutrition.source =
    // 'swiss-blv-v7'`, version included — so a BLV V8 with a new source string would have
    // re-inserted all 1191 foods as duplicates. The version is informational and gets bumped
    // on the existing rows instead.
    const [sourceRows] = await conn.execute(
      `SELECT external_id, ingredient_id FROM ingredient_sources WHERE dataset = ?`,
      [DATASET]
    )
    const idByExternal = new Map(sourceRows.map((r) => [String(r.external_id), r.ingredient_id]))

    const toInsert = []
    const toUpdate = []
    for (const row of foods) (idByExternal.has(row.id) ? toUpdate : toInsert).push(row)
    console.log(`${toInsert.length} new, ${toUpdate.length} existing — writing in batches of ${BATCH}…`)

    // ── Write, batched, in one transaction ─────────────────────────────────
    //
    // Multi-row statements instead of three per food: 1191 foods become ~30 statements.
    // Either everything lands or nothing does, so a failed deploy never leaves half a
    // dataset behind for the next run to reason about.
    await conn.beginTransaction()
    try {
      let written = 0
      const progress = () => process.stdout.write(`  ${written}/${foods.length}...\r`)

      for (let i = 0; i < toInsert.length; i += BATCH) {
        const batch = toInsert.slice(i, i + BATCH)
        const [result] = await conn.query(
          `INSERT INTO ingredients (name, name_translations, category, synonyms) VALUES ?`,
          [batch.map((row) => ingredientValues(row))]
        )
        // InnoDB hands a multi-row VALUES insert its auto-increment block in one allocation,
        // so the ids are `insertId … insertId + n - 1` — the same guarantee Drizzle's
        // `$returningId()` is built on. The row count is checked rather than assumed.
        if (result.affectedRows !== batch.length) {
          throw new Error(`Expected ${batch.length} inserted ingredients, got ${result.affectedRows}`)
        }
        batch.forEach((row, k) => idByExternal.set(row.id, result.insertId + k))

        await conn.query(
          `INSERT INTO ingredient_sources (ingredient_id, dataset, external_id, dataset_version) VALUES ?`,
          [batch.map((row) => [idByExternal.get(row.id), DATASET, row.id, DATASET_VERSION])]
        )
        await upsertNutrition(conn, batch, idByExternal)
        await writeSearchTerms(
          conn,
          batch.map((row) => searchTermRow(row, idByExternal))
        )
        written += batch.length
        progress()
      }

      for (let i = 0; i < toUpdate.length; i += BATCH) {
        const batch = toUpdate.slice(i, i + BATCH)
        // A bulk UPDATE keyed by primary key: every id already exists, so the "insert" half
        // never fires and only the listed columns move. `created_by`, `manufacturer` and
        // `created_at` are left alone — those are not the dataset's to overwrite.
        await conn.query(
          `INSERT INTO ingredients (id, name, name_translations, category, synonyms) VALUES ? AS incoming
           ON DUPLICATE KEY UPDATE
             name = incoming.name,
             name_translations = incoming.name_translations,
             category = incoming.category,
             synonyms = incoming.synonyms`,
          [batch.map((row) => [idByExternal.get(row.id), ...ingredientValues(row)])]
        )
        await upsertNutrition(conn, batch, idByExternal)
        await writeSearchTerms(
          conn,
          batch.map((row) => searchTermRow(row, idByExternal))
        )
        written += batch.length
        progress()
      }

      if (toUpdate.length > 0) {
        await conn.query(`UPDATE ingredient_sources SET dataset_version = ? WHERE dataset = ? AND external_id IN (?)`, [
          DATASET_VERSION,
          DATASET,
          toUpdate.map((row) => row.id),
        ])
      }

      await conn.commit()
    } catch (err) {
      await conn.rollback()
      throw err
    }

    console.log(
      `\n✓ Imported ${toInsert.length} new + updated ${toUpdate.length} existing ingredients (${foods.length} total processed).`
    )
  } finally {
    await conn.end()
  }
}

// ── Row builders ─────────────────────────────────────────────────────────────

/** `ingredients` columns in the order (name, name_translations, category, synonyms). */
function ingredientValues(row) {
  // Canonical name: EN when available, else DE
  const canonicalName = row.names.en || row.names.de || `Swiss-${row.id}`
  return [canonicalName, JSON.stringify(row.names), mapCategory(row.kategorie), JSON.stringify(row.synonyms)]
}

/** The shape `writeSearchTerms()` reads — the same columns the DB row would have. */
function searchTermRow(row, idByExternal) {
  return {
    id: idByExternal.get(row.id),
    name: ingredientValues(row)[0],
    name_translations: row.names,
    synonyms: row.synonyms,
  }
}

/** Upsert `ingredient_nutrition` for one batch. Keyed by the ingredient's primary key. */
async function upsertNutrition(conn, batch, idByExternal) {
  const values = batch.map((row) => {
    const n = row.nutrition
    const micros = JSON.stringify(Object.fromEntries(Object.entries(n.micros).filter(([, v]) => v !== null)))
    return [
      idByExternal.get(row.id),
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
      row.dichte,
      micros,
      NUTRITION_SOURCE,
      row.id,
    ]
  })
  await conn.query(
    `INSERT INTO ingredient_nutrition
       (ingredient_id, energy_kcal_100g, energy_kj_100g, fat_100g, saturated_fat_100g,
        carbs_100g, sugars_100g, starch_100g, fiber_100g, protein_100g, salt_100g,
        alcohol_100g, water_100g, density_g_per_ml, micros, source, external_id)
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
       density_g_per_ml   = incoming.density_g_per_ml,
       micros             = incoming.micros,
       source             = incoming.source,
       external_id        = incoming.external_id`,
    [values]
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
