/**
 * One place that answers "may this caller see / change this recipe?".
 *
 * The same eight lines — select owner + visibility, 404 if missing, 404 (not 403) if
 * private and not yours — were copy-pasted into every recipe-scoped endpoint. They
 * agreed, which is luck rather than design: the moment one of them returns 403 for a
 * private recipe instead of 404, that endpoint becomes an existence oracle for private
 * recipes while its neighbours stay quiet.
 *
 * **404, never 403, for a private recipe.** A 403 confirms the id exists. Since recipe
 * ids are sequential integers, that would turn any endpoint into an enumerator for how
 * many private recipes a user has.
 */
import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { recipeBranches, recipeCommits, recipes } from '~~/server/database/schema'

export interface VisibleRecipe {
  id: number
  ownerId: number
  visibility: 'public' | 'private'
  /** True when the caller is signed in AND owns this recipe. */
  isOwner: boolean
  /** The signed-in caller's id, or null for a guest. */
  viewerId: number | null
}

/**
 * Load a recipe the caller is allowed to read, or throw.
 *
 * @throws 400 when the id is not a positive integer, 404 when the recipe does not exist
 *   or is private and not the caller's, 503 when the database is unavailable.
 */
export async function requireVisibleRecipe(event: H3Event, recipeId: number): Promise<VisibleRecipe> {
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid recipe id' })
  }

  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [recipe] = await db
    .select({ id: recipes.id, ownerId: recipes.ownerId, visibility: recipes.visibility })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1)

  if (!recipe) throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })

  const session = await getUserSession(event)
  const viewerId = session?.user?.id ?? null

  if (recipe.visibility === 'private' && recipe.ownerId !== viewerId) {
    throw createError({ statusCode: 404, statusMessage: 'Recipe not found' })
  }

  return {
    id: recipe.id,
    ownerId: recipe.ownerId,
    visibility: recipe.visibility,
    isOwner: viewerId !== null && recipe.ownerId === viewerId,
    viewerId,
  }
}

/**
 * Confirm a commit id actually belongs to a recipe, and return it.
 *
 * `recipe_commits` carries no `recipe_id` — a commit belongs to a branch, which belongs
 * to a recipe — so a caller-supplied commit id has to be joined back through
 * `recipe_branches` before it can be used as a scope. Skip this and any endpoint taking
 * `?commitId=` becomes a way to read or write against a snapshot in somebody else's
 * private recipe.
 *
 * @throws 404 when the commit does not exist or lives in a different recipe.
 */
export async function requireCommitInRecipe(recipeId: number, commitId: number): Promise<number> {
  const db = useDrizzle()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable.' })

  const [commit] = await db
    .select({ id: recipeCommits.id })
    .from(recipeCommits)
    .innerJoin(recipeBranches, eq(recipeCommits.branchId, recipeBranches.id))
    .where(and(eq(recipeCommits.id, commitId), eq(recipeBranches.recipeId, recipeId)))
    .limit(1)

  if (!commit) throw createError({ statusCode: 404, statusMessage: 'Commit not found' })
  return commit.id
}
