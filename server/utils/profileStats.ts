/**
 * Richer profile stats — a contribution graph, the most-forked recipe, and a handful of
 * activity counts, all computed live (no schema change, no new counter, no reconciliation
 * script entry).
 *
 * ## The bug the obvious query would have shipped
 *
 * `fork.post.ts` copies a recipe's full commit history into a fork while PRESERVING the
 * original `author_id` (see that file's own docblock: "preserving lineage, authors and
 * timestamps"). A naive "commits authored by X" query therefore re-counts every one of X's
 * commits again for every fork someone else makes of X's recipe — inflating the graph, and
 * doing so in a way that reads as "forking your recipe made you newly active", which is
 * both wrong and a little unsettling. Every query below filters on `recipes.owner_id =
 * profileUserId` IN ADDITION TO `recipe_commits.author_id = profileUserId` — i.e. "commits
 * you made on repos you own," which is what "your activity" actually means here.
 *
 * ## Visibility
 *
 * A stranger viewing this profile must not learn "this person touched a private recipe"
 * even as an aggregate count. Every query is filtered to
 * `recipes.visibility = 'public' OR recipes.owner_id = viewerId` — the same rule
 * `requireVisibleRecipe` encodes elsewhere, applied here to aggregates rather than a
 * single row.
 */
import { and, desc, eq, gte, or, sql } from 'drizzle-orm'
import { gourmergeRequests, recipeBranches, recipeCommits, recipes } from '~~/server/database/schema'

type Db = NonNullable<ReturnType<typeof useDrizzle>>

export interface ContributionDay {
  day: string
  commits: number
}

export interface MostForkedRecipe {
  id: number
  title: string
  slug: string
  description: string | null
  difficulty: 'easy' | 'medium' | 'hard'
  dietaryType: string | null
  servings: number
  prepTimeMinutes: number | null
  cookTimeMinutes: number | null
  visibility: 'public' | 'private'
  starCount: number
  forkCount: number
  createdAt: Date
}

export interface ProfileStats {
  contributionGraph: ContributionDay[]
  mostForkedRecipe: MostForkedRecipe | null
  activity: {
    recipesPublished: number
    commitsMade: number
    gmrsOpened: number
    gmrsMerged: number
  }
}

export async function getProfileStats(db: Db, profileUserId: number, viewerId: number | null): Promise<ProfileStats> {
  const visibilityFilter = viewerId
    ? or(eq(recipes.visibility, 'public'), eq(recipes.ownerId, viewerId))
    : eq(recipes.visibility, 'public')

  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const [graphRows, mostForkedRows, publishedRow, commitsRow, gmrRows] = await Promise.all([
    // Contribution graph — last 12 months, grouped by day.
    db
      .select({ day: sql<string>`DATE(${recipeCommits.createdAt})`, commits: sql<number>`COUNT(*)` })
      .from(recipeCommits)
      .innerJoin(recipeBranches, eq(recipeCommits.branchId, recipeBranches.id))
      .innerJoin(recipes, eq(recipeBranches.recipeId, recipes.id))
      .where(
        and(
          eq(recipeCommits.authorId, profileUserId),
          eq(recipes.ownerId, profileUserId),
          visibilityFilter,
          gte(recipeCommits.createdAt, oneYearAgo)
        )
      )
      .groupBy(sql`DATE(${recipeCommits.createdAt})`),

    // Most-forked recipe — existing denormalized forkCount, no new counter. Selects the
    // full `RecipeCard`-shaped row (same fields as `explore.get.ts`) so the profile page
    // can reuse that component rather than a bespoke card with padded-out fake fields.
    db
      .select({
        id: recipes.id,
        title: recipes.title,
        slug: recipes.slug,
        description: recipes.description,
        difficulty: recipes.difficulty,
        dietaryType: recipes.dietaryType,
        servings: recipes.servings,
        prepTimeMinutes: recipes.prepTimeMinutes,
        cookTimeMinutes: recipes.cookTimeMinutes,
        visibility: recipes.visibility,
        starCount: recipes.starCount,
        forkCount: recipes.forkCount,
        createdAt: recipes.createdAt,
      })
      .from(recipes)
      .where(and(eq(recipes.ownerId, profileUserId), visibilityFilter))
      .orderBy(desc(recipes.forkCount))
      .limit(1),

    // Recipes published — viewer-independent by construction: "published" means public,
    // so this is the same number for every viewer including the owner. Deliberately NOT
    // branched on `isOwnProfile` to include private recipes — that would turn "published"
    // into something it isn't.
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(recipes)
      .where(and(eq(recipes.ownerId, profileUserId), eq(recipes.visibility, 'public'))),

    // Commits made — same join/filter shape as the graph, no date window.
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(recipeCommits)
      .innerJoin(recipeBranches, eq(recipeCommits.branchId, recipeBranches.id))
      .innerJoin(recipes, eq(recipeBranches.recipeId, recipes.id))
      .where(and(eq(recipeCommits.authorId, profileUserId), eq(recipes.ownerId, profileUserId), visibilityFilter)),

    // GMRs opened + merged, joined through `recipes` so a private target recipe's GMR
    // count isn't visible to a stranger even in aggregate.
    db
      .select({ status: gourmergeRequests.status, n: sql<number>`COUNT(*)` })
      .from(gourmergeRequests)
      .innerJoin(recipes, eq(gourmergeRequests.recipeId, recipes.id))
      .where(and(eq(gourmergeRequests.authorId, profileUserId), visibilityFilter))
      .groupBy(gourmergeRequests.status),
  ])

  const gmrsOpened = gmrRows.reduce((sum, r) => sum + Number(r.n), 0)
  const gmrsMerged = gmrRows.find((r) => r.status === 'merged')?.n ?? 0

  // "Most forked" with zero forks isn't a meaningful callout — omit rather than show a
  // recipe that has never actually been forked.
  const mostForked = mostForkedRows[0]
  return {
    contributionGraph: graphRows.map((r) => ({ day: r.day, commits: Number(r.commits) })),
    mostForkedRecipe: mostForked && mostForked.forkCount > 0 ? mostForked : null,
    activity: {
      recipesPublished: Number(publishedRow[0]?.n ?? 0),
      commitsMade: Number(commitsRow[0]?.n ?? 0),
      gmrsOpened,
      gmrsMerged: Number(gmrsMerged),
    },
  }
}
