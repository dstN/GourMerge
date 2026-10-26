/**
 * Pure helpers for the BLS 4.0 import — everything that can be unit-tested without a
 * spreadsheet or a database: the code systematics, the scope rule, the category mapping,
 * the value markers, the nutrient mapping and the erratum corrections.
 *
 * BLS code: [letter][6 digits], mostly. Letter = main group (B bread … W sausage, X/Y dishes),
 * 6th character = preparation (0/1 as sold or raw, 2–9 cooked, fried, baked …). A handful of
 * codes carry a letter in positions 3–4 (`M5B1600`); nothing here depends on those.
 */

/** `ingredient_sources.dataset` — the family, never versioned. */
export const DATASET = 'bls'
/** `ingredient_sources.dataset_version` — bump when the MRI publishes 4.1. */
export const DATASET_VERSION = '4.0'
/** `ingredient_nutrition.source` for values that come from this dataset. */
export const NUTRITION_SOURCE = 'bls-4.0'

/**
 * Groups B–W are foods one can buy; X and Y are dishes the MRI calculated from recipes
 * (Kalbsfrikassee, Gulaschsuppe). A dish is what GourMerge makes out of ingredients, so X/Y
 * stay out unless `bls-map.csv` lists a code explicitly — which it does for the ~235 that
 * are ingredients in their own right: stocks, sauces, dressings, doughs.
 */
export function isDishGroup(code) {
  return code[0] === 'X' || code[0] === 'Y'
}

/**
 * BLS main group → the category keys the Swiss import already uses (see CATEGORY_MAP in
 * import-swiss-foods.mjs), so the picker and the autocomplete badge keep one vocabulary.
 * Potatoes go with grain for the same reason they do in the Swiss data (starchy staple).
 */
export function categoryForCode(code) {
  const g = code[0]
  const sub = code[1]
  switch (g) {
    case 'B':
    case 'C':
      return 'grain'
    case 'D':
      return 'sweet'
    case 'E':
      return sub === '1' ? 'egg' : 'grain'
    case 'F':
      return 'fruit'
    case 'G':
      return 'vegetable'
    case 'H':
      if ('1234'.includes(sub)) return 'nut'
      if ('56'.includes(sub)) return 'vegetable'
      return 'legume'
    case 'K':
      if (sub === '7') return 'vegetable'
      if (sub === '8') return 'other'
      return 'grain'
    case 'M':
      return 'dairy'
    case 'N':
      return 'beverage'
    case 'P':
      return 'alcohol'
    case 'Q':
      return sub === '9' ? 'condiment' : 'oil'
    case 'R':
      if (sub === '4') return 'baking'
      if (sub === '8') return 'other'
      if (sub === '9') return 'sweet'
      return 'condiment'
    case 'S':
      return 'sweet'
    case 'T':
      return 'fish'
    case 'U':
    case 'V':
    case 'W':
      return 'meat'
    case 'X':
      return sub === '3' ? 'condiment' : 'other'
    case 'Y':
      return 'other'
    default:
      return 'other'
  }
}

/**
 * One cell of the data file. `-` means "no reliable value" and must not read as zero;
 * `TR`, `<LOQ` and `<LOD` mean "present, below what the method can quantify", which for a
 * recipe total is as good as zero (the documentation calls that a conservative estimate).
 * Decimal commas appear only in the German headers, never in the cells.
 */
export function parseValue(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim()
  if (s === '' || s === '-') return null
  if (s === 'TR' || s === '<LOQ' || s === '<LOD') return 0
  const n = parseFloat(s.replace(',', '.'))
  return Number.isNaN(n) ? null : n
}

function round(n, decimals) {
  if (n === null) return null
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

/** Macro columns (DECIMAL(8,2) in `ingredient_nutrition`) ← BLS component codes. */
const MACROS = {
  energyKcal: 'ENERCC',
  energyKj: 'ENERCJ',
  fat: 'FAT',
  saturatedFat: 'FASAT',
  carbs: 'CHO',
  sugars: 'SUGAR',
  starch: 'STARCH',
  fiber: 'FIBT',
  protein: 'PROT625',
  salt: 'NACL',
  alcohol: 'ALC',
  water: 'WATER',
}

/**
 * `ingredient_nutrition.micros` keys (shared/utils/ingredientMicros.ts) ← BLS codes, with a
 * unit factor where the two disagree: BLS reports vitamin B6 in µg, the catalog in mg.
 * Selenium has no BLS component at all. Vitamin A is the retinol equivalent (RE), as in the
 * Swiss data, not the RAE.
 */
const MICROS = {
  vit_a_re_mcg: ['VITA', 1],
  retinol_mcg: ['RETOL', 1],
  beta_carotene_mcg: ['CARTB', 1],
  vit_b1_mg: ['THIA', 1],
  vit_b2_mg: ['RIBF', 1],
  vit_b6_mg: ['VITB6', 1 / 1000],
  vit_b12_mcg: ['VITB12', 1],
  niacin_mg: ['NIA', 1],
  folate_mcg: ['FOL', 1],
  pantothenic_mg: ['PANTAC', 1],
  vit_c_mg: ['VITC', 1],
  vit_d_mcg: ['VITD', 1],
  vit_e_mg: ['VITE', 1],
  potassium_mg: ['K', 1],
  sodium_mg: ['NA', 1],
  chloride_mg: ['CLD', 1],
  calcium_mg: ['CA', 1],
  magnesium_mg: ['MG', 1],
  phosphorus_mg: ['P', 1],
  iron_mg: ['FE', 1],
  iodine_mcg: ['ID', 1],
  zinc_mg: ['ZN', 1],
}

/**
 * Erratum §3: the MRI's software added OLSAC (available oligosaccharides) a second time to
 * the energy, as if they were fibre — 8 kJ/g and 2 kcal/g on top of the 17/4 already inside
 * CHO. 411 foods, up to +23 % (glucose syrup). The documented formula is right; the
 * published numbers are not, until 4.1. Subtracting the extra term reproduces the formula.
 */
export function correctEnergy(kcal, kj, olsac) {
  if (olsac === null || olsac <= 0) return { kcal, kj }
  return {
    kcal: kcal === null ? null : round(kcal - 2 * olsac, 2),
    kj: kj === null ? null : round(kj - 8 * olsac, 2),
  }
}

/**
 * @param values  component code → raw cell value, for one food
 * @param erratum the food's entry from bls-4.0-errata.json, if any
 * @returns the `nutrition` object the seed carries, or null when the erratum says so
 */
export function mapNutrition(values, erratum) {
  if (erratum && 'nutrition' in erratum && erratum.nutrition === null) return null

  const get = (code) => parseValue(values[code])
  const energy = correctEnergy(get('ENERCC'), get('ENERCJ'), get('OLSAC'))

  const nutrition = {}
  for (const [field, code] of Object.entries(MACROS)) nutrition[field] = round(get(code), 2)
  nutrition.energyKcal = energy.kcal
  nutrition.energyKj = energy.kj

  const micros = {}
  for (const [key, [code, factor]] of Object.entries(MICROS)) {
    const v = get(code)
    if (v !== null) micros[key] = round(v * factor, 3)
  }
  for (const [key, v] of Object.entries(erratum?.micros ?? {})) micros[key] = v
  nutrition.micros = micros

  return nutrition
}

/** The decision file's own grammar — one row per BLS code that is not the default. */
const DECISIONS = new Set(['same', 'new', 'skip'])

/**
 * Parse `bls-map.csv`. Columns: bls_code,decision,target,note. Quotes are not supported —
 * notes must not contain commas, which the writer enforces.
 */
export function parseMap(text) {
  const rows = new Map()
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'))
  const header = lines.shift()
  if (header !== 'bls_code,decision,target,note') throw new Error(`bls-map.csv: unexpected header "${header}"`)
  for (const line of lines) {
    const [code, decision, target, ...rest] = line.split(',')
    if (!code || !DECISIONS.has(decision)) throw new Error(`bls-map.csv: bad row "${line}"`)
    if (decision === 'same' && !/^(swiss:\d+|curated:.+)$/.test(target ?? '')) {
      throw new Error(`bls-map.csv: "same" needs a swiss:<id> or curated:<name> target — "${line}"`)
    }
    if (rows.has(code)) throw new Error(`bls-map.csv: ${code} listed twice`)
    rows.set(code, { decision, target: target || null, note: rest.join(',') || null })
  }
  return rows
}

/**
 * The effective decision for a code: the map wins, otherwise groups B–W are imported and
 * the dish groups are not.
 */
export function decisionFor(code, map) {
  const row = map.get(code)
  if (row) return row
  return { decision: isDishGroup(code) ? 'skip' : 'new', target: null, note: null }
}
