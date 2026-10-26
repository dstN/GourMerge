/**
 * Normalisation behind the ingredient autocomplete.
 *
 * The catalog mixes three spellings of the same food: Swiss BLV names ("Karotte/Möhre, roh"),
 * BLS names written database-style ("Weizen Mehl, Type 405"), and whatever a user typed.
 * Searching the raw strings means "Weizenmehl" misses the BLS flour and "Moehre" misses the
 * carrot. So every searchable string is reduced to a canonical form once, at write time, and
 * the query is reduced the same way at read time — the two only have to agree with each
 * other, never with how the name is displayed.
 *
 * Shared by the server (search endpoint, create/edit handlers) and by the plain-Node seed
 * scripts, which import this file directly — so it must stay dependency-free and use only
 * syntax Node can strip without a build step (no enums, no parameter properties).
 */

export interface IngredientSearchTerm {
  /** `de` / `en` / `fr` / `it`, or null for a canonical name that is not one of the translations. */
  locale: string | null
  kind: 'name' | 'synonym'
  /** Normalised, single-space separated words. */
  term: string
  /** `term` without spaces. */
  compact: string
}

/** Matches the `term` / `compact` column widths in `ingredient_search_terms`. */
const MAX_TERM_LENGTH = 200

/**
 * Lower-case, fold umlauts and accents (both the letter and its two-letter spelling, so
 * "Möhre", "Moehre" and "Mohre" collapse to the same string), drop everything that is not a
 * letter or digit, and collapse the spaces. Lossy on purpose: the result is only ever
 * compared with another result of this function, never shown.
 */
export function normalizeSearchTerm(input: string): string {
  return (
    input
      .toLowerCase()
      // Ligatures first — NFKD does not decompose these.
      .replace(/ß/g, 'ss')
      .replace(/æ/g, 'ae')
      .replace(/œ/g, 'oe')
      // é → e + combining acute, ä → a + combining diaeresis, then strip the marks.
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      // German digraph spellings of the umlauts, after the real umlauts are already bare.
      // "ue" is left alone after a "q" ("Roquefort", "Queso"), where it is never an ü.
      .replace(/ae/g, 'a')
      .replace(/oe/g, 'o')
      .replace(/(?<!q)ue/g, 'u')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  )
}

/** The words of a normalised query. */
export function searchWords(query: string): string[] {
  const normalized = normalizeSearchTerm(query)
  return normalized ? normalized.split(' ') : []
}

export interface IngredientNames {
  name: string
  nameTranslations?: Record<string, string> | null
  synonyms?: Record<string, string[]> | null
}

/** Stable order, so a rebuild writes the same rows in the same sequence every time. */
const LOCALE_ORDER = ['de', 'en', 'fr', 'it']

function orderedLocales(keys: string[]): string[] {
  const rest = keys.filter((k) => !LOCALE_ORDER.includes(k)).sort()
  return [...LOCALE_ORDER.filter((k) => keys.includes(k)), ...rest]
}

/**
 * Every row `ingredient_search_terms` should hold for one ingredient: each locale's name,
 * the canonical `name` when it is not already one of them, and every synonym. Deduplicated
 * per (locale, term) — the same word in four locales is four rows, which is what lets the
 * search prefer the viewer's own locale.
 */
export function searchTermsForIngredient(names: IngredientNames): IngredientSearchTerm[] {
  const out: IngredientSearchTerm[] = []
  const seen = new Set<string>()

  const push = (locale: string | null, kind: 'name' | 'synonym', raw: string | null | undefined) => {
    if (typeof raw !== 'string') return
    const term = normalizeSearchTerm(raw).slice(0, MAX_TERM_LENGTH).trim()
    if (!term) return
    const key = `${locale ?? ''}\u0000${term}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ locale, kind, term, compact: term.replace(/ /g, '') })
  }

  const translations = names.nameTranslations ?? {}
  for (const locale of orderedLocales(Object.keys(translations))) {
    push(locale, 'name', translations[locale])
  }

  // The canonical name only earns its own row when no translation already normalises to it.
  const canonical = normalizeSearchTerm(names.name).slice(0, MAX_TERM_LENGTH).trim()
  if (canonical && !out.some((t) => t.kind === 'name' && t.term === canonical)) {
    push(null, 'name', names.name)
  }

  const synonyms = names.synonyms ?? {}
  for (const locale of orderedLocales(Object.keys(synonyms))) {
    const list = synonyms[locale]
    if (!Array.isArray(list)) continue
    for (const synonym of list) push(locale, 'synonym', synonym)
  }

  return out
}
