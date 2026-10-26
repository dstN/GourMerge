/**
 * GET /api/ingredients?q=&locale=&limit=
 *
 * Search the global ingredients master table. Used by the IngredientAutocomplete component.
 *
 * Matches against `ingredient_search_terms`, not the name columns: every locale's name and
 * every synonym, normalised once at write time by `normalizeSearchTerm()` so that "Möhre",
 * "moehre" and "mohre" are one string, and "Weizenmehl" finds a dataset row written as
 * "Weizen Mehl, Type 405" through the space-free `compact` column. The query goes through
 * the same normaliser, so the two sides only ever have to agree with each other.
 *
 * Ranked — the catalog is several thousand rows and the dropdown shows ten, so order is the
 * feature. Per ingredient the best of its matching terms decides:
 *   0  the whole term equals the query ("tomate" → "Tomate")
 *   1  the term starts with the query as whole words ("tomate" → "Tomate, roh", "Tomate, getrocknet")
 *   2  the term starts with the query inside a word ("tomate" → "Tomatensaft")
 *   3  the compact term starts with the compact query ("weizenmehl" → "Weizen Mehl, Type 405"),
 *      or every query word is the prefix of some word ("möhre" → "Karotte/Möhre", "mehl typ 405")
 *   4  the compact query appears anywhere in the compact term ("mehl" → "Buchweizenmehl")
 *   5  every query word appears somewhere in the compact term ("mehl weizen" → "Weizenmehl")
 * The last two need three characters per word, below which they match most of the table.
 * Ties, judged on the one best-matching term of the ingredient: a term in the viewer's
 * locale beats one in another, a name beats a synonym, and a shorter matched term beats a
 * longer one — which is what puts "Tomate, roh" above "Tomate, gekocht" and both above
 * "Tomatensuppe", without the data having to say which is "raw".
 *
 * Locale-aware: if a matching translation exists in the requested locale, it's returned as
 * `localeName` for display; the canonical English `name` is always included for dedup/ID
 * purposes.
 *
 * Includes compact nutrition summary (kcal + macros) and `hasNutrition` flag.
 */
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { searchWords } from '~~/shared/utils/ingredientSearch'

const querySchema = z.object({
  q: z.string().min(1).max(100),
  // A bare language code: it ends up inside a JSON path below, where anything else would be
  // a syntax error (and a 500) rather than a lookup miss.
  locale: z
    .string()
    .regex(/^[a-z]{2}$/)
    .default('de'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

/** Bounds the number of LIKE conditions a long query can turn into. */
const MAX_QUERY_WORDS = 6

/** Below this the substring tier would match most of the table for no gain. */
const MIN_SUBSTRING_LENGTH = 3

interface SearchRow {
  id: number
  name: string
  name_translations: Record<string, string> | string | null
  category: string | null
  manufacturer: string | null
  created_by: number | null
  energy_kcal_100g: string | null
  protein_100g: string | null
  carbs_100g: string | null
  fat_100g: string | null
  fiber_100g: string | null
  density_g_per_ml: string | null
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const result = querySchema.safeParse(query)
  if (!result.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid query params' })
  }

  const { q, locale, limit } = result.data
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const words = searchWords(q).slice(0, MAX_QUERY_WORDS)
  if (words.length === 0) return []

  const session = await getUserSession(event)

  const normalized = words.join(' ')
  const compact = words.join('')

  // Escaped once, used everywhere below — a `%`/`_` in `q` should match itself, not act as
  // a wildcard the caller never asked for (see likeEscape.ts). The normaliser has already
  // dropped both, so this is belt and braces.
  const wordStart = sql`t.term LIKE ${`${escapeLikePattern(normalized)} %`}`
  const prefix = sql`t.term LIKE ${`${escapeLikePattern(normalized)}%`}`
  const compactPrefix = sql`t.compact LIKE ${`${escapeLikePattern(compact)}%`}`
  const wordPrefix = sql.join(
    words.map((w) => sql`(t.term LIKE ${`${escapeLikePattern(w)}%`} OR t.term LIKE ${`% ${escapeLikePattern(w)}%`})`),
    sql` AND `
  )
  const substring =
    compact.length >= MIN_SUBSTRING_LENGTH ? sql`t.compact LIKE ${`%${escapeLikePattern(compact)}%`}` : sql`FALSE`
  const allWordsSubstring =
    words.length >= 2 && words.every((w) => w.length >= MIN_SUBSTRING_LENGTH)
      ? sql.join(
          words.map((w) => sql`t.compact LIKE ${`%${escapeLikePattern(w)}%`}`),
          sql` AND `
        )
      : sql`FALSE`

  const tier = sql`CASE
    WHEN t.term = ${normalized} THEN 0
    WHEN ${wordStart} THEN 1
    WHEN ${prefix} THEN 2
    WHEN ${compactPrefix} OR (${wordPrefix}) THEN 3
    WHEN ${substring} THEN 4
    ELSE 5
  END`

  // Exact ⊂ word-start ⊂ prefix ⊂ compact-prefix ⊂ substring, so the WHERE only needs the
  // outermost conditions; the CASE above re-derives the finer tiers.
  // One score per matching term — tier first, then the viewer's locale, then name before
  // synonym, then length — and the ingredient ranks by its single best term. Scoring the
  // parts across different terms (best tier from one, "is a name" from another) let a
  // sauce whose Italian name merely contains "peperoni" outrank the pepper itself.
  // The name/synonym step is small on purpose: a paired Swiss food keeps its old German
  // name as a synonym, and "Zwiebel, roh" should still beat "Zwiebel, geröstet (ohne …)".
  const score = sql`${tier} * 100000
    + CASE WHEN t.locale = ${locale} THEN 0 ELSE 10000 END
    + CASE WHEN t.kind = 'name' THEN 0 ELSE 10 END
    + CHAR_LENGTH(t.term)`

  const rows = (await db.execute(sql`
    SELECT i.id, i.name, i.name_translations, i.category, i.manufacturer, i.created_by,
           n.energy_kcal_100g, n.protein_100g, n.carbs_100g, n.fat_100g, n.fiber_100g, n.density_g_per_ml
      FROM (
        SELECT t.ingredient_id, MIN(${score}) AS score
          FROM ingredient_search_terms t
         WHERE ${compactPrefix} OR (${wordPrefix}) OR ${substring} OR (${allWordsSubstring})
         GROUP BY t.ingredient_id
      ) m
      JOIN ingredients i ON i.id = m.ingredient_id
      LEFT JOIN ingredient_nutrition n ON n.ingredient_id = i.id
     ORDER BY m.score ASC, i.id ASC
     LIMIT ${limit}
  `)) as unknown as SearchRow[][]

  return (rows[0] ?? []).map((row) => {
    // mysql2 parses JSON columns on the way out; tolerate a raw string all the same.
    const raw = row.name_translations
    const translations = (typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {})) as Record<string, string>
    const hasNutrition = row.energy_kcal_100g !== null
    return {
      id: row.id,
      name: row.name,
      localeName: translations[locale] ?? translations['en'] ?? row.name,
      category: row.category,
      manufacturer: row.manufacturer,
      canEdit: !!session?.user && row.created_by === session.user.id,
      hasNutrition,
      nutrition: hasNutrition
        ? {
            kcal: row.energy_kcal_100g ? parseFloat(row.energy_kcal_100g) : null,
            protein: row.protein_100g ? parseFloat(row.protein_100g) : null,
            carbs: row.carbs_100g ? parseFloat(row.carbs_100g) : null,
            fat: row.fat_100g ? parseFloat(row.fat_100g) : null,
            fiber: row.fiber_100g ? parseFloat(row.fiber_100g) : null,
            densityGPerMl: row.density_g_per_ml ? parseFloat(row.density_g_per_ml) : null,
          }
        : null,
    }
  })
})
