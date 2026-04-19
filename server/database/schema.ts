/**
 * GourMerge — Drizzle ORM Database Schema (MariaDB)
 *
 * This schema implements the Git-like versioning model for recipes:
 * - Recipes = Repositories
 * - Branches = Lightweight pointers to head commits
 * - Commits = Snapshots of recipe state (ingredients + steps)
 * - Forks = Recipe copies with a reference to the original
 * - GourMerge Requests = Proposals to merge changes between branches
 *
 * ⚠️ WORDING RULE: The term "Pull Request" is FORBIDDEN.
 *    Use "GourMerge Request" / "gourmerge_request" exclusively.
 */

import { mysqlTable, int, varchar, text, datetime, timestamp, mysqlEnum, json, decimal, boolean, index, uniqueIndex } from 'drizzle-orm/mysql-core'
import { relations, sql } from 'drizzle-orm'

// ═══════════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════════

export const users = mysqlTable('users', {
  id: int('id').primaryKey().autoincrement(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  displayName: varchar('display_name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  bio: text('bio'),
  preferredLocale: varchar('preferred_locale', { length: 10 }).notNull().default('de'),
  preferredMeasurementSystem: mysqlEnum('preferred_measurement_system', ['metric', 'imperial']).notNull().default('metric'),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
})

// ═══════════════════════════════════════════════════════════════
// INGREDIENTS (Global Master Table)
// ═══════════════════════════════════════════════════════════════

export const ingredients = mysqlTable('ingredients', {
  id: int('id').primaryKey().autoincrement(),
  /** Canonical name (English, used as fallback) */
  name: varchar('name', { length: 200 }).notNull(),
  /** Localized names: { "en": "Flour", "de": "Mehl", "fr": "Farine" } */
  nameTranslations: json('name_translations').notNull().default({}),
  /** Category for grouping: "dairy", "spice", "vegetable", etc. */
  category: varchar('category', { length: 100 }),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_ingredients_name').on(table.name),
  index('idx_ingredients_category').on(table.category),
])

// ═══════════════════════════════════════════════════════════════
// RECIPES (Repositories)
// ═══════════════════════════════════════════════════════════════

export const recipes = mysqlTable('recipes', {
  id: int('id').primaryKey().autoincrement(),
  ownerId: int('owner_id').notNull().references(() => users.id),
  title: varchar('title', { length: 300 }).notNull(),
  description: text('description'),
  visibility: mysqlEnum('visibility', ['public', 'private']).notNull().default('public'),
  /** NULL if this is an original recipe; set if this is a fork */
  forkedFromRecipeId: int('forked_from_recipe_id').references(() => recipes.id),
  servings: int('servings').notNull().default(4),
  prepTimeMinutes: int('prep_time_minutes'),
  cookTimeMinutes: int('cook_time_minutes'),
  difficulty: mysqlEnum('difficulty', ['easy', 'medium', 'hard']).notNull().default('medium'),
  /** Denormalized counters for performance */
  starCount: int('star_count').notNull().default(0),
  forkCount: int('fork_count').notNull().default(0),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
}, (table) => [
  index('idx_recipes_owner').on(table.ownerId),
  index('idx_recipes_forked_from').on(table.forkedFromRecipeId),
  index('idx_recipes_visibility').on(table.visibility),
])

// ═══════════════════════════════════════════════════════════════
// RECIPE TAGS
// ═══════════════════════════════════════════════════════════════

export const tags = mysqlTable('tags', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  nameTranslations: json('name_translations').notNull().default({}),
})

export const recipeTags = mysqlTable('recipe_tags', {
  id: int('id').primaryKey().autoincrement(),
  recipeId: int('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  tagId: int('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (table) => [
  uniqueIndex('idx_recipe_tags_unique').on(table.recipeId, table.tagId),
])

// ═══════════════════════════════════════════════════════════════
// RECIPE STARS (Favorites)
// ═══════════════════════════════════════════════════════════════

export const recipeStars = mysqlTable('recipe_stars', {
  id: int('id').primaryKey().autoincrement(),
  recipeId: int('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  userId: int('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex('idx_recipe_stars_unique').on(table.recipeId, table.userId),
])

// ═══════════════════════════════════════════════════════════════
// BRANCHES (Lightweight pointers to head commit)
// ═══════════════════════════════════════════════════════════════

export const recipeBranches = mysqlTable('recipe_branches', {
  id: int('id').primaryKey().autoincrement(),
  recipeId: int('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  /** Points to the latest commit on this branch */
  headCommitId: int('head_commit_id'),
  /** Is this the default branch (like 'main')? */
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex('idx_branches_recipe_name').on(table.recipeId, table.name),
  index('idx_branches_head_commit').on(table.headCommitId),
])

// ═══════════════════════════════════════════════════════════════
// COMMITS (Snapshots of recipe state)
// ═══════════════════════════════════════════════════════════════

export const recipeCommits = mysqlTable('recipe_commits', {
  id: int('id').primaryKey().autoincrement(),
  branchId: int('branch_id').notNull().references(() => recipeBranches.id, { onDelete: 'cascade' }),
  /** Links to parent commit for DAG traversal. NULL = initial commit. */
  parentCommitId: int('parent_commit_id'),
  authorId: int('author_id').notNull().references(() => users.id),
  /** Human-readable commit message, e.g. "Zucker reduziert" */
  message: varchar('message', { length: 500 }).notNull(),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_commits_branch').on(table.branchId),
  index('idx_commits_parent').on(table.parentCommitId),
  index('idx_commits_author').on(table.authorId),
  index('idx_commits_created').on(table.createdAt),
])

// ═══════════════════════════════════════════════════════════════
// COMMIT INGREDIENTS (Snapshot per commit)
// ═══════════════════════════════════════════════════════════════
// Each commit stores a FULL snapshot of all ingredients.
// This makes diffs trivial and avoids delta reconstruction.

export const recipeCommitIngredients = mysqlTable('recipe_commit_ingredients', {
  id: int('id').primaryKey().autoincrement(),
  commitId: int('commit_id').notNull().references(() => recipeCommits.id, { onDelete: 'cascade' }),
  ingredientId: int('ingredient_id').notNull().references(() => ingredients.id),
  /**
   * Quantity in canonical metric units (grams for mass, milliliters for volume).
   * Display conversion to imperial/other units happens in the API/Frontend layer.
   * Using DECIMAL(10,2) for precision without floating-point issues.
   */
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
  /**
   * Canonical unit. The DB enforces metric storage:
   * - 'g' (grams) for all mass
   * - 'ml' (milliliters) for all volume
   * - 'piece', 'pinch', 'tsp', 'tbsp' for countable/small measures
   */
  unit: mysqlEnum('unit', ['g', 'ml', 'piece', 'pinch', 'tsp', 'tbsp']).notNull(),
  /** Optional notes like "finely chopped", "room temperature" */
  notes: varchar('notes', { length: 300 }),
  sortOrder: int('sort_order').notNull().default(0),
}, (table) => [
  index('idx_commit_ingredients_commit').on(table.commitId),
  index('idx_commit_ingredients_ingredient').on(table.ingredientId),
])

// ═══════════════════════════════════════════════════════════════
// COMMIT STEPS (Markdown content snapshot per commit)
// ═══════════════════════════════════════════════════════════════
// Each step is conceptually a "file" in the recipe repo.
// Content is Markdown generated by the TipTap WYSIWYG editor.

export const recipeCommitSteps = mysqlTable('recipe_commit_steps', {
  id: int('id').primaryKey().autoincrement(),
  commitId: int('commit_id').notNull().references(() => recipeCommits.id, { onDelete: 'cascade' }),
  sortOrder: int('sort_order').notNull(),
  /**
   * Markdown content for this step.
   * Generated by TipTap 3 via @tiptap/markdown.
   * May contain inline image references: ![desc](img::<uuid>)
   */
  content: text('content').notNull(),
}, (table) => [
  index('idx_commit_steps_commit').on(table.commitId),
  index('idx_commit_steps_order').on(table.commitId, table.sortOrder),
])

// ═══════════════════════════════════════════════════════════════
// GOURMERGE REQUESTS (our branded "Pull Requests")
// ═══════════════════════════════════════════════════════════════
// ⚠️  WORDING: Never use "pull_request" anywhere. It's "gourmerge_request".

export const gourmergeRequests = mysqlTable('gourmerge_requests', {
  id: int('id').primaryKey().autoincrement(),
  /** The recipe this GourMerge Request belongs to (target repo) */
  recipeId: int('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  authorId: int('author_id').notNull().references(() => users.id),
  title: varchar('title', { length: 300 }).notNull(),
  description: text('description'),
  status: mysqlEnum('status', ['open', 'closed', 'merged', 'draft']).notNull().default('open'),
  /** Branch with the proposed changes */
  sourceBranchId: int('source_branch_id').notNull().references(() => recipeBranches.id),
  /** Branch to merge into */
  targetBranchId: int('target_branch_id').notNull().references(() => recipeBranches.id),
  /**
   * For cross-recipe GourMerge Requests (from forks).
   * NULL if source and target are in the same recipe.
   */
  sourceRecipeId: int('source_recipe_id').references(() => recipes.id),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
}, (table) => [
  index('idx_gourmerge_requests_recipe').on(table.recipeId),
  index('idx_gourmerge_requests_author').on(table.authorId),
  index('idx_gourmerge_requests_status').on(table.status),
  index('idx_gourmerge_requests_source').on(table.sourceBranchId),
  index('idx_gourmerge_requests_target').on(table.targetBranchId),
])

// ═══════════════════════════════════════════════════════════════
// GOURMERGE REQUEST COMMENTS
// ═══════════════════════════════════════════════════════════════

export const gourmergeRequestComments = mysqlTable('gourmerge_request_comments', {
  id: int('id').primaryKey().autoincrement(),
  gourmergeRequestId: int('gourmerge_request_id').notNull().references(() => gourmergeRequests.id, { onDelete: 'cascade' }),
  authorId: int('author_id').notNull().references(() => users.id),
  /** Markdown body */
  body: text('body').notNull(),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
}, (table) => [
  index('idx_gourmerge_comments_request').on(table.gourmergeRequestId),
  index('idx_gourmerge_comments_author').on(table.authorId),
])

// ═══════════════════════════════════════════════════════════════
// DRIZZLE RELATIONS
// ═══════════════════════════════════════════════════════════════

export const usersRelations = relations(users, ({ many }) => ({
  recipes: many(recipes),
  commits: many(recipeCommits),
  gourmergeRequests: many(gourmergeRequests),
  stars: many(recipeStars),
}))

export const ingredientsRelations = relations(ingredients, ({ many }) => ({
  commitIngredients: many(recipeCommitIngredients),
}))

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  owner: one(users, { fields: [recipes.ownerId], references: [users.id] }),
  forkedFrom: one(recipes, { fields: [recipes.forkedFromRecipeId], references: [recipes.id], relationName: 'forks' }),
  forks: many(recipes, { relationName: 'forks' }),
  branches: many(recipeBranches),
  tags: many(recipeTags),
  stars: many(recipeStars),
  gourmergeRequests: many(gourmergeRequests),
}))

export const recipeBranchesRelations = relations(recipeBranches, ({ one, many }) => ({
  recipe: one(recipes, { fields: [recipeBranches.recipeId], references: [recipes.id] }),
  headCommit: one(recipeCommits, { fields: [recipeBranches.headCommitId], references: [recipeCommits.id] }),
  commits: many(recipeCommits),
}))

export const recipeCommitsRelations = relations(recipeCommits, ({ one, many }) => ({
  branch: one(recipeBranches, { fields: [recipeCommits.branchId], references: [recipeBranches.id] }),
  parent: one(recipeCommits, { fields: [recipeCommits.parentCommitId], references: [recipeCommits.id], relationName: 'commitChain' }),
  children: many(recipeCommits, { relationName: 'commitChain' }),
  author: one(users, { fields: [recipeCommits.authorId], references: [users.id] }),
  ingredients: many(recipeCommitIngredients),
  steps: many(recipeCommitSteps),
}))

export const recipeCommitIngredientsRelations = relations(recipeCommitIngredients, ({ one }) => ({
  commit: one(recipeCommits, { fields: [recipeCommitIngredients.commitId], references: [recipeCommits.id] }),
  ingredient: one(ingredients, { fields: [recipeCommitIngredients.ingredientId], references: [ingredients.id] }),
}))

export const recipeCommitStepsRelations = relations(recipeCommitSteps, ({ one }) => ({
  commit: one(recipeCommits, { fields: [recipeCommitSteps.commitId], references: [recipeCommits.id] }),
}))

export const gourmergeRequestsRelations = relations(gourmergeRequests, ({ one, many }) => ({
  recipe: one(recipes, { fields: [gourmergeRequests.recipeId], references: [recipes.id] }),
  author: one(users, { fields: [gourmergeRequests.authorId], references: [users.id] }),
  sourceBranch: one(recipeBranches, { fields: [gourmergeRequests.sourceBranchId], references: [recipeBranches.id] }),
  targetBranch: one(recipeBranches, { fields: [gourmergeRequests.targetBranchId], references: [recipeBranches.id] }),
  sourceRecipe: one(recipes, { fields: [gourmergeRequests.sourceRecipeId], references: [recipes.id] }),
  comments: many(gourmergeRequestComments),
}))

export const gourmergeRequestCommentsRelations = relations(gourmergeRequestComments, ({ one }) => ({
  gourmergeRequest: one(gourmergeRequests, { fields: [gourmergeRequestComments.gourmergeRequestId], references: [gourmergeRequests.id] }),
  author: one(users, { fields: [gourmergeRequestComments.authorId], references: [users.id] }),
}))

export const recipeTagsRelations = relations(recipeTags, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeTags.recipeId], references: [recipes.id] }),
  tag: one(tags, { fields: [recipeTags.tagId], references: [tags.id] }),
}))

export const recipeStarsRelations = relations(recipeStars, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeStars.recipeId], references: [recipes.id] }),
  user: one(users, { fields: [recipeStars.userId], references: [users.id] }),
}))
