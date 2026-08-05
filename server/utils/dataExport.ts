/**
 * GDPR Art. 15 / Art. 20 — collect everything stored about one account.
 *
 * Built on request and streamed straight to the client; nothing is ever written
 * to disk. That is deliberate: the export is the single most sensitive artefact
 * this app can produce, and a file sitting in a directory is one misconfigured
 * webroot away from being public. The trade-off is that a very large account
 * pays the query cost on each download, which at v1 scale is nothing.
 *
 * JSON rather than a ZIP: Art. 20 asks for a "structured, commonly used,
 * machine-readable format", which JSON satisfies, and it avoids adding an
 * archiving dependency for a single file.
 */
import { eq, inArray } from 'drizzle-orm'
import {
  users,
  recipes,
  recipeBranches,
  recipeCommits,
  recipeCommitIngredients,
  recipeCommitSteps,
  recipeStars,
  recipeTags,
  tags,
  gourmergeRequests,
  gourmergeRequestComments,
  contactMessages,
} from '~~/server/database/schema'
import { bufferToUuid } from '~~/server/utils/uuid'

export interface DataExport {
  meta: {
    generatedAt: string
    format: string
    note: string
  }
  account: Record<string, unknown>
  recipes: unknown[]
  starredRecipes: unknown[]
  gourmergeRequests: unknown[]
  comments: unknown[]
  contactMessages: unknown[]
}

/**
 * @param db     Drizzle instance
 * @param userId Internal user id — the caller must already have proven ownership.
 */
export async function buildDataExport(
  db: NonNullable<ReturnType<typeof useDrizzle>>,
  userId: number
): Promise<DataExport> {
  const [account] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!account) throw new Error(`user ${userId} not found`)

  // The password hash is the one column that must never leave the server: it is
  // not "data about the user" in any useful sense and exporting it only creates
  // an offline-cracking target.
  const {
    passwordHash: _omitted,
    publicId: _pid,
    ...safeAccount
  } = account as Record<string, unknown> & {
    passwordHash: string
    publicId?: Buffer
  }

  const ownRecipes = await db.select().from(recipes).where(eq(recipes.ownerId, userId))
  const recipeIds = ownRecipes.map((r) => r.id)

  // Drizzle's inArray on an empty array produces invalid SQL, so short-circuit.
  const branches = recipeIds.length
    ? await db.select().from(recipeBranches).where(inArray(recipeBranches.recipeId, recipeIds))
    : []
  const branchIds = branches.map((b) => b.id)

  const commits = branchIds.length
    ? await db.select().from(recipeCommits).where(inArray(recipeCommits.branchId, branchIds))
    : []
  const commitIds = commits.map((c) => c.id)

  const [ingredients, steps, recipeTagRows] = await Promise.all([
    commitIds.length
      ? db.select().from(recipeCommitIngredients).where(inArray(recipeCommitIngredients.commitId, commitIds))
      : Promise.resolve([]),
    commitIds.length
      ? db.select().from(recipeCommitSteps).where(inArray(recipeCommitSteps.commitId, commitIds))
      : Promise.resolve([]),
    recipeIds.length
      ? db
          .select({ recipeId: recipeTags.recipeId, tag: tags.name })
          .from(recipeTags)
          .innerJoin(tags, eq(tags.id, recipeTags.tagId))
          .where(inArray(recipeTags.recipeId, recipeIds))
      : Promise.resolve([]),
  ])

  // Nest the version history under each recipe — a flat dump of commit ids is
  // technically complete but useless to a human exercising their access right.
  const recipesOut = ownRecipes.map((r) => {
    const rBranches = branches.filter((b) => b.recipeId === r.id)
    return {
      ...r,
      publicId: r.publicId ? bufferToUuid(r.publicId) : null,
      tags: recipeTagRows.filter((t) => t.recipeId === r.id).map((t) => t.tag),
      branches: rBranches.map((b) => ({
        ...b,
        commits: commits
          .filter((c) => c.branchId === b.id)
          .map((c) => ({
            ...c,
            ingredients: ingredients.filter((i) => i.commitId === c.id),
            steps: steps.filter((s) => s.commitId === c.id),
          })),
      })),
    }
  })

  const [starred, ownGmrs, ownComments, contacts] = await Promise.all([
    db
      .select({ recipeId: recipeStars.recipeId, createdAt: recipeStars.createdAt })
      .from(recipeStars)
      .where(eq(recipeStars.userId, userId)),
    db.select().from(gourmergeRequests).where(eq(gourmergeRequests.authorId, userId)),
    db.select().from(gourmergeRequestComments).where(eq(gourmergeRequestComments.authorId, userId)),
    // Contact messages have no user FK — they are matched on the address, which
    // is the only link that exists between a message and an account.
    db.select().from(contactMessages).where(eq(contactMessages.email, account.email)),
  ])

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      format: 'GourMerge data export v1 (GDPR Art. 15 / Art. 20)',
      note: 'Recipes include their full branch and commit history. Contact-form messages are matched by email address. The password hash is deliberately excluded.',
    },
    account: safeAccount,
    recipes: recipesOut,
    starredRecipes: starred,
    gourmergeRequests: ownGmrs.map((g) => ({ ...g, publicId: g.publicId ? bufferToUuid(g.publicId) : null })),
    comments: ownComments,
    contactMessages: contacts,
  }
}
