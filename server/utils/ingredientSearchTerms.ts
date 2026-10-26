/**
 * Keep `ingredient_search_terms` in step with one ingredient's names.
 *
 * Called by the create and edit handlers for user-created rows. The seed scripts do the
 * same for the rows they write (`scripts/lib/search-terms.mjs`), and
 * `scripts/rebuild-search-terms.mjs` sweeps the whole table after every seed; all three
 * derive the rows from `searchTermsForIngredient()`, so what a user can type to find an
 * ingredient never depends on which path wrote it.
 *
 * Replace, never merge: the ingredient's current names are the whole truth.
 */
import { eq } from 'drizzle-orm'
import { ingredientSearchTerms } from '~~/server/database/schema'
import { searchTermsForIngredient } from '~~/shared/utils/ingredientSearch'
import type { IngredientNames } from '~~/shared/utils/ingredientSearch'

type Db = NonNullable<ReturnType<typeof useDrizzle>>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export async function syncIngredientSearchTerms(db: Db | Tx, ingredientId: number, names: IngredientNames) {
  const terms = searchTermsForIngredient(names)
  await db.delete(ingredientSearchTerms).where(eq(ingredientSearchTerms.ingredientId, ingredientId))
  if (terms.length > 0) {
    await db.insert(ingredientSearchTerms).values(terms.map((t) => ({ ingredientId, ...t })))
  }
}
