/**
 * Shared by the seed scripts: (re)write `ingredient_search_terms` for a set of ingredients.
 *
 * Lives next to the scripts rather than in `server/utils/` because the scripts are plain
 * Node with a `mysql2` connection, not Nitro with Drizzle — the Nitro side has its own
 * `syncIngredientSearchTerms()` for single rows. Both derive the rows from the same
 * `searchTermsForIngredient()`, which is the part that must not fork.
 *
 * Replaces, never merges: the caller's rows are the truth for those ingredients. The caller
 * owns the transaction.
 */

import { searchTermsForIngredient } from '../../shared/utils/ingredientSearch.ts'

/** Ingredients per DELETE + INSERT round trip. */
const INGREDIENT_BATCH = 500

/** mysql2 hands JSON columns back parsed; be tolerant of a string anyway. */
export function asJson(value, fallback) {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return fallback
    }
  }
  return value
}

/**
 * @param conn  an open `mysql2/promise` connection, inside a transaction if the caller wants one
 * @param rows  `{ id, name, name_translations, synonyms }` — the column shapes of `ingredients`,
 *              JSON either parsed or as a string
 * @returns the number of term rows written
 */
export async function writeSearchTerms(conn, rows) {
  let written = 0
  for (let i = 0; i < rows.length; i += INGREDIENT_BATCH) {
    const slice = rows.slice(i, i + INGREDIENT_BATCH)
    const values = []
    for (const row of slice) {
      const terms = searchTermsForIngredient({
        name: row.name,
        nameTranslations: asJson(row.name_translations, {}),
        synonyms: asJson(row.synonyms, {}),
      })
      for (const t of terms) values.push([row.id, t.locale, t.kind, t.term, t.compact])
    }
    await conn.query('DELETE FROM ingredient_search_terms WHERE ingredient_id IN (?)', [slice.map((r) => r.id)])
    if (values.length > 0) {
      await conn.query('INSERT INTO ingredient_search_terms (ingredient_id, locale, kind, term, compact) VALUES ?', [
        values,
      ])
    }
    written += values.length
  }
  return written
}
