/**
 * Git-like versioning model: recipes are repositories, branches are pointers to head
 * commits, commits are ingredient/step snapshots, forks reference their original, and
 * GourMerge Requests propose merging changes between branches.
 *
 * Naming rule: never "Pull Request" — always "GourMerge Request" / "gourmerge_request".
 */

import {
  mysqlTable,
  int,
  varchar,
  text,
  datetime,
  timestamp,
  mysqlEnum,
  json,
  decimal,
  boolean,
  index,
  uniqueIndex,
  customType,
} from 'drizzle-orm/mysql-core'
import type { MySqlColumn } from 'drizzle-orm/mysql-core'
import { relations, sql } from 'drizzle-orm'

// BINARY(16) custom type for UUIDv7 external identifiers.
// We store as raw bytes (most compact, index-friendly) and convert to/from hex string at the boundary.
const binary16 = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'BINARY(16)'
  },
})

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
  preferredMeasurementSystem: mysqlEnum('preferred_measurement_system', ['metric', 'imperial'])
    .notNull()
    .default('metric'),
  /** Set when user confirms their email address. NULL = unverified. */
  emailVerifiedAt: datetime('email_verified_at'),
  /** Set when user completes or explicitly dismisses the onboarding tour. NULL = not yet shown. */
  onboardingCompletedAt: datetime('onboarding_completed_at'),
  /** True if the user clicked "Don't show again" on the tour offer. */
  tourDismissed: boolean('tour_dismissed').notNull().default(false),
  /**
   * Set when the user finishes the full interactive tour (all steps including
   * fork + delete). Only resettable by the user clicking "Onboarding neu
   * starten" in the help menu. Controls visibility of the system tour recipe:
   * users who have finished the tour no longer see it in explore.
   */
  hasFinishedTour: boolean('has_finished_tour').notNull().default(false),
  /** JSON array of sub-tour names the user has completed (e.g. ['branches', 'gmr']) */
  completedTours: json('completed_tours').$type<string[]>(),
  /**
   * Set when the account was erased under Art. 17. The row deliberately
   * SURVIVES: four FKs into `users` are NOT NULL and RESTRICT
   * (recipes.owner_id, recipe_commits.author_id, gourmerge_requests.author_id,
   * gm_request_comments.author_id), and a fork copies commits keeping the
   * ORIGINAL author_id — so a hard delete would either fail on the constraint
   * or tear holes in somebody else's recipe history. Instead the identifying
   * columns are overwritten in place, which is GitHub's `ghost` behaviour but
   * per-user, so two deleted accounts stay distinguishable in a thread.
   */
  anonymizedAt: datetime('anonymized_at'),

  /**
   * Marks the single shared tombstone account that inherits attribution from
   * hard-deleted users (`ghost`). It is never loginable: `password_hash` holds a
   * value no password can produce. Exactly one row has this set.
   */
  isGhost: boolean('is_ghost').notNull().default(false),

  /**
   * Last successful login. **This is the clock for inactivity deletion** — not
   * `updated_at`, which is a `timestamp … ON UPDATE CURRENT_TIMESTAMP` and so moves
   * on any write to the row (a locale change, a counter touch), which would make an
   * abandoned account look active forever.
   *
   * A login is the only thing that resets it. Warning emails deliberately do not:
   * otherwise the notice itself would keep extending the retention period.
   */
  lastLoginAt: datetime('last_login_at'),

  /**
   * Inactivity-notice bookkeeping — one column per stage rather than a counter, so
   * the nightly job is idempotent (it can ask "was THIS notice already sent?"
   * instead of trusting an ordering) and so support can see exactly what a user was
   * told and when. All three are cleared on login.
   */
  inactivityNotice6mAt: datetime('inactivity_notice_6m_at'),
  inactivityNotice4wAt: datetime('inactivity_notice_4w_at'),
  inactivityNotice24hAt: datetime('inactivity_notice_24h_at'),

  createdAt: datetime('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .onUpdateNow(),
})

// ═══════════════════════════════════════════════════════════════
// TWO-FACTOR AUTHENTICATION (TOTP, RFC 6238)
// ═══════════════════════════════════════════════════════════════
// App-agnostic on purpose: the standard `otpauth://totp/…` URI with the default
// SHA1 / 6 digits / 30s parameters works in Google Authenticator, Authy,
// 1Password, Bitwarden, Aegis and Microsoft Authenticator alike. Google
// Authenticator in particular *ignores* non-default `algorithm`/`digits`
// parameters, so deviating from those defaults silently breaks it.

export const userTotp = mysqlTable('user_totp', {
  id: int('id').primaryKey().autoincrement(),
  userId: int('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  /**
   * Base32 TOTP secret, **encrypted at rest** (AES-256-GCM, see
   * `server/utils/totp.ts`). A plaintext secret in the database is a bearer token
   * for every account that has 2FA enabled — a DB dump would defeat the feature it
   * is supposed to provide.
   */
  secretEncrypted: text('secret_encrypted').notNull(),
  /**
   * Null until the user proves possession by entering a first valid code. An
   * unconfirmed row must never gate a login, or a failed setup would lock the user
   * out of their own account.
   */
  confirmedAt: datetime('confirmed_at'),
  /**
   * Highest 30-second time step already accepted. Replay protection: a code is
   * valid for its whole window, so without this an intercepted code could be
   * reused within the same period.
   */
  lastUsedCounter: int('last_used_counter'),
  createdAt: datetime('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
})

/**
 * Single-use recovery codes, bcrypt-hashed like every other credential here.
 * Without these, a lost phone is an unrecoverable lockout — which is the most
 * common reason 2FA rollouts generate support load.
 */
export const userRecoveryCodes = mysqlTable(
  'user_recovery_codes',
  {
    id: int('id').primaryKey().autoincrement(),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: varchar('code_hash', { length: 255 }).notNull(),
    usedAt: datetime('used_at'),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index('user_recovery_codes_user_idx').on(table.userId)]
)

// ═══════════════════════════════════════════════════════════════
// PASSKEYS (WebAuthn / FIDO2)
// ═══════════════════════════════════════════════════════════════
// A passkey replaces the password entirely rather than adding a step to it: the
// private key never leaves the authenticator, and unlocking it requires the device
// plus a biometric or PIN. That is already two factors, which is why a passkey login
// does NOT then ask for a TOTP code — see server/routes/auth/passkey-authenticate.post.ts.

export const userPasskeys = mysqlTable(
  'user_passkeys',
  {
    id: int('id').primaryKey().autoincrement(),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * The credential id from the authenticator, base64url. Globally unique, and the
     * lookup key during authentication — the browser sends it before we know who is
     * signing in, which is what makes usernameless login possible.
     */
    credentialId: varchar('credential_id', { length: 255 }).notNull().unique(),
    /** COSE public key, base64url. Public by definition, so no encryption needed. */
    publicKey: text('public_key').notNull(),
    /**
     * Signature counter. Authenticators that implement it increment on every
     * assertion; a counter that fails to advance is the documented signal of a cloned
     * credential. Many passkeys (iCloud, Google) always report 0 — see
     * `verifyPasskeyCounter` for why that is not treated as an error.
     */
    counter: int('counter').notNull().default(0),
    /** True for a synced passkey (iCloud Keychain, Google Password Manager). */
    backedUp: boolean('backed_up').notNull().default(false),
    /** JSON array of hints such as `["internal","hybrid"]`, used on re-auth. */
    transports: json('transports').$type<string[]>(),
    /** User-facing label, so a person with three keys can tell them apart. */
    name: varchar('name', { length: 100 }).notNull(),
    lastUsedAt: datetime('last_used_at'),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index('user_passkeys_user_idx').on(table.userId)]
)

/**
 * Short-lived WebAuthn challenges.
 *
 * A challenge is issued in one request and verified in the next, so it has to
 * survive between them. It deliberately does **not** live in the user session:
 * authentication starts with no session at all, and Passenger runs several processes,
 * so in-memory storage would break as soon as the two requests hit different workers
 * (the same reason the rate limiter is DB-backed).
 *
 * Rows are single-use and swept by the retention job.
 */
export const webauthnChallenges = mysqlTable(
  'webauthn_challenges',
  {
    id: int('id').primaryKey().autoincrement(),
    /** Opaque id echoed by the client to pair the two halves of the ceremony. */
    attemptId: varchar('attempt_id', { length: 255 }).notNull().unique(),
    challenge: varchar('challenge', { length: 255 }).notNull(),
    expiresAt: datetime('expires_at').notNull(),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index('webauthn_challenges_expires_idx').on(table.expiresAt)]
)

// ═══════════════════════════════════════════════════════════════
// INGREDIENTS (Global Master Table)
// ═══════════════════════════════════════════════════════════════

export const ingredients = mysqlTable(
  'ingredients',
  {
    id: int('id').primaryKey().autoincrement(),
    /** Canonical name (English, used as fallback) */
    name: varchar('name', { length: 200 }).notNull(),
    /** Localized names: { "en": "Carrot", "de": "Karotte", "fr": "Carotte", "it": "Carota" } */
    nameTranslations: json('name_translations').notNull().default({}),
    /** Category for grouping: "dairy", "spice", "vegetable", etc. */
    category: varchar('category', { length: 100 }),
    /** Per-locale synonyms from the Swiss BLV DB Synonyme field: { "de": ["Rüebli", "Möhre"] } */
    synonyms: json('synonyms').notNull().default({}),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index('idx_ingredients_name').on(table.name), index('idx_ingredients_category').on(table.category)]
)

// ═══════════════════════════════════════════════════════════════
// INGREDIENT NUTRITION (1:1 with ingredients, per-100g-edible basis)
// ═══════════════════════════════════════════════════════════════
// Source: Swiss BLV Food Composition Database V7.0 (naehrwertdaten.ch)
// All macro values are per 100 g or 100 ml of edible portion.
// Missing values are NULL (Swiss DB marks these as "k.A.").

export const ingredientNutrition = mysqlTable(
  'ingredient_nutrition',
  {
    ingredientId: int('ingredient_id')
      .primaryKey()
      .references(() => ingredients.id, { onDelete: 'cascade' }),

    // ── Energy ─────────────────────────────────────────────────
    energyKcal100g: decimal('energy_kcal_100g', { precision: 8, scale: 2 }),
    energyKj100g: decimal('energy_kj_100g', { precision: 8, scale: 2 }),

    // ── Macronutrients (g per 100 g) ───────────────────────────
    fat100g: decimal('fat_100g', { precision: 8, scale: 2 }),
    saturatedFat100g: decimal('saturated_fat_100g', { precision: 8, scale: 2 }),
    carbs100g: decimal('carbs_100g', { precision: 8, scale: 2 }),
    sugars100g: decimal('sugars_100g', { precision: 8, scale: 2 }),
    starch100g: decimal('starch_100g', { precision: 8, scale: 2 }),
    fiber100g: decimal('fiber_100g', { precision: 8, scale: 2 }),
    protein100g: decimal('protein_100g', { precision: 8, scale: 2 }),
    salt100g: decimal('salt_100g', { precision: 8, scale: 2 }),
    alcohol100g: decimal('alcohol_100g', { precision: 8, scale: 2 }),
    water100g: decimal('water_100g', { precision: 8, scale: 2 }),

    // ── Unit conversions ────────────────────────────────────────
    /** Density in g/mL (from Swiss `Dichte`). Used to convert ml→g for volume ingredients. */
    densityGPerMl: decimal('density_g_per_ml', { precision: 6, scale: 3 }),
    /** Approximate grams per 1 piece (e.g. egg ≈ 60 g). NULL if not applicable. */
    gramsPerPiece: int('grams_per_piece'),

    // ── Micronutrients (JSON, vitamins + minerals long-tail) ───
    /** { "vitamin_c_mg": 6.7, "calcium_mg": 33, ... } */
    micros: json('micros').default({}),

    // ── Provenance ──────────────────────────────────────────────
    /** Source identifier: 'swiss-blv-v7', 'off', 'usda', 'curated' */
    source: varchar('source', { length: 50 }).notNull().default('swiss-blv-v7'),
    /** External ID from the source database (Swiss BLV numeric ID) */
    externalId: varchar('external_id', { length: 50 }),

    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .onUpdateNow(),
  },
  (table) => [index('idx_nutrition_source_ext').on(table.source, table.externalId)]
)

// ═══════════════════════════════════════════════════════════════
// RECIPES (Repositories)
// ═══════════════════════════════════════════════════════════════

export const recipes = mysqlTable(
  'recipes',
  {
    id: int('id').primaryKey().autoincrement(),
    /**
     * External opaque identifier (UUIDv7, time-ordered → dense B-tree index).
     * Used in public URLs/API responses — never expose the internal INT id.
     */
    publicId: binary16('public_id').notNull(),
    ownerId: int('owner_id')
      .notNull()
      .references(() => users.id),
    title: varchar('title', { length: 300 }).notNull(),
    /** URL-safe slug, unique per owner (like GitHub repo names) */
    slug: varchar('slug', { length: 300 }).notNull(),
    description: text('description'),
    visibility: mysqlEnum('visibility', ['public', 'private']).notNull().default('public'),
    /** NULL if this is an original recipe; set if this is a fork */
    forkedFromRecipeId: int('forked_from_recipe_id').references((): MySqlColumn => recipes.id),
    servings: int('servings').notNull().default(4),
    prepTimeMinutes: int('prep_time_minutes'),
    cookTimeMinutes: int('cook_time_minutes'),
    difficulty: mysqlEnum('difficulty', ['easy', 'medium', 'hard']).notNull().default('medium'),
    /** Dietary label: null = unspecified */
    dietaryType: varchar('dietary_type', { length: 50 }),
    titleTranslations: json('title_translations').default(null),
    descriptionTranslations: json('description_translations').default(null),
    /** Denormalized counters for performance */
    starCount: int('star_count').notNull().default(0),
    forkCount: int('fork_count').notNull().default(0),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .onUpdateNow(),
  },
  (table) => [
    uniqueIndex('idx_recipes_public_id').on(table.publicId),
    index('idx_recipes_owner').on(table.ownerId),
    index('idx_recipes_forked_from').on(table.forkedFromRecipeId),
    index('idx_recipes_visibility').on(table.visibility),
    index('idx_recipes_visibility_stars').on(table.visibility, table.starCount),
    index('idx_recipes_visibility_created').on(table.visibility, table.createdAt),
    uniqueIndex('idx_recipes_owner_slug').on(table.ownerId, table.slug),
  ]
)

// ═══════════════════════════════════════════════════════════════
// RECIPE TAGS
// ═══════════════════════════════════════════════════════════════

export const tags = mysqlTable('tags', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  nameTranslations: json('name_translations').notNull().default({}),
})

export const recipeTags = mysqlTable(
  'recipe_tags',
  {
    id: int('id').primaryKey().autoincrement(),
    recipeId: int('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    tagId: int('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [uniqueIndex('idx_recipe_tags_unique').on(table.recipeId, table.tagId)]
)

// ═══════════════════════════════════════════════════════════════
// RECIPE STARS (Favorites)
// ═══════════════════════════════════════════════════════════════

export const recipeStars = mysqlTable(
  'recipe_stars',
  {
    id: int('id').primaryKey().autoincrement(),
    recipeId: int('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex('idx_recipe_stars_unique').on(table.recipeId, table.userId)]
)

// ═══════════════════════════════════════════════════════════════
// BRANCHES (Lightweight pointers to head commit)
// ═══════════════════════════════════════════════════════════════

export const recipeBranches = mysqlTable(
  'recipe_branches',
  {
    id: int('id').primaryKey().autoincrement(),
    recipeId: int('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    /** Points to the latest commit on this branch */
    headCommitId: int('head_commit_id'),
    /** Is this the default branch (like 'main')? */
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('idx_branches_recipe_name').on(table.recipeId, table.name),
    index('idx_branches_head_commit').on(table.headCommitId),
  ]
)

// ═══════════════════════════════════════════════════════════════
// COMMITS (Snapshots of recipe state)
// ═══════════════════════════════════════════════════════════════

export const recipeCommits = mysqlTable(
  'recipe_commits',
  {
    id: int('id').primaryKey().autoincrement(),
    branchId: int('branch_id')
      .notNull()
      .references(() => recipeBranches.id, { onDelete: 'cascade' }),
    /** Links to parent commit for DAG traversal. NULL = initial commit. */
    parentCommitId: int('parent_commit_id'),
    authorId: int('author_id')
      .notNull()
      .references(() => users.id),
    /** Human-readable commit message, e.g. "Zucker reduziert" */
    message: varchar('message', { length: 500 }).notNull(),
    /** True for commits created by merging a GourMerge Request. */
    isMerge: boolean('is_merge').notNull().default(false),
    /** For merge commits: the second parent (from the source branch). Primary parent is parentCommitId. */
    mergeSourceCommitId: int('merge_source_commit_id'),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_commits_branch').on(table.branchId),
    index('idx_commits_parent').on(table.parentCommitId),
    index('idx_commits_author').on(table.authorId),
    index('idx_commits_created').on(table.createdAt),
  ]
)

// ═══════════════════════════════════════════════════════════════
// COMMIT INGREDIENTS (Snapshot per commit)
// ═══════════════════════════════════════════════════════════════
// Each commit stores a FULL snapshot of all ingredients.
// This makes diffs trivial and avoids delta reconstruction.

export const recipeCommitIngredients = mysqlTable(
  'recipe_commit_ingredients',
  {
    id: int('id').primaryKey().autoincrement(),
    commitId: int('commit_id')
      .notNull()
      .references(() => recipeCommits.id, { onDelete: 'cascade' }),
    ingredientId: int('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
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
  },
  (table) => [
    index('idx_commit_ingredients_commit').on(table.commitId),
    index('idx_commit_ingredients_ingredient').on(table.ingredientId),
  ]
)

// ═══════════════════════════════════════════════════════════════
// COMMIT STEPS (Markdown content snapshot per commit)
// ═══════════════════════════════════════════════════════════════
// Each step is conceptually a "file" in the recipe repo.
// Content is Markdown generated by the TipTap WYSIWYG editor.

export const recipeCommitSteps = mysqlTable(
  'recipe_commit_steps',
  {
    id: int('id').primaryKey().autoincrement(),
    commitId: int('commit_id')
      .notNull()
      .references(() => recipeCommits.id, { onDelete: 'cascade' }),
    sortOrder: int('sort_order').notNull(),
    /**
     * Markdown content for this step.
     * Generated by TipTap 3 via @tiptap/markdown.
     * May contain inline image references: ![desc](img::<uuid>)
     */
    content: text('content').notNull(),
    contentTranslations: json('content_translations').default(null),
  },
  (table) => [
    index('idx_commit_steps_commit').on(table.commitId),
    index('idx_commit_steps_order').on(table.commitId, table.sortOrder),
  ]
)

// ═══════════════════════════════════════════════════════════════
// GOURMERGE REQUESTS (branched change proposals — propose/review/merge model)
// ═══════════════════════════════════════════════════════════════
// ⚠️  WORDING: Never use "pull_request" anywhere. It's "gourmerge_request". (design-check-ignore: states the rule)

export const gourmergeRequests = mysqlTable(
  'gourmerge_requests',
  {
    id: int('id').primaryKey().autoincrement(),
    /**
     * External opaque identifier (UUIDv7). Used in shareable GourMerge Request URLs.
     */
    publicId: binary16('public_id').notNull(),
    /** The recipe this GourMerge Request belongs to (target repo) */
    recipeId: int('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    authorId: int('author_id')
      .notNull()
      .references(() => users.id),
    title: varchar('title', { length: 300 }).notNull(),
    description: text('description'),
    status: mysqlEnum('status', ['open', 'closed', 'merged', 'draft']).notNull().default('open'),
    /** Branch with the proposed changes */
    sourceBranchId: int('source_branch_id')
      .notNull()
      .references(() => recipeBranches.id),
    /** Branch to merge into */
    targetBranchId: int('target_branch_id')
      .notNull()
      .references(() => recipeBranches.id),
    /**
     * For cross-recipe GourMerge Requests (from forks).
     * NULL if source and target are in the same recipe.
     */
    sourceRecipeId: int('source_recipe_id').references(() => recipes.id),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .onUpdateNow(),
  },
  (table) => [
    uniqueIndex('idx_gourmerge_requests_public_id').on(table.publicId),
    index('idx_gourmerge_requests_recipe').on(table.recipeId),
    index('idx_gourmerge_requests_author').on(table.authorId),
    index('idx_gourmerge_requests_status').on(table.status),
    index('idx_gourmerge_requests_source').on(table.sourceBranchId),
    index('idx_gourmerge_requests_target').on(table.targetBranchId),
  ]
)

// ═══════════════════════════════════════════════════════════════
// GOURMERGE REQUEST COMMENTS
// ═══════════════════════════════════════════════════════════════

export const gourmergeRequestComments = mysqlTable(
  'gm_request_comments',
  {
    id: int('id').primaryKey().autoincrement(),
    gourmergeRequestId: int('gm_request_id')
      .notNull()
      .references(() => gourmergeRequests.id, { onDelete: 'cascade' }),
    authorId: int('author_id')
      .notNull()
      .references(() => users.id),
    /** Markdown body */
    body: text('body').notNull(),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .onUpdateNow(),
  },
  (table) => [
    index('idx_gm_comments_request').on(table.gourmergeRequestId),
    index('idx_gm_comments_author').on(table.authorId),
  ]
)

// ═══════════════════════════════════════════════════════════════
// EMAIL VERIFICATION TOKENS
// ═══════════════════════════════════════════════════════════════
// Tokens are CSPRNG — NOT UUIDv7 (predictable prefix would weaken them).

export const emailVerificationTokens = mysqlTable(
  'email_verification_tokens',
  {
    id: int('id').primaryKey().autoincrement(),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** bcrypt hash of the CSPRNG token sent to the user */
    tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
    expiresAt: datetime('expires_at').notNull(),
    usedAt: datetime('used_at'),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index('idx_email_tokens_user').on(table.userId)]
)

// ═══════════════════════════════════════════════════════════════
// EMAIL CHANGE TOKENS
// ═══════════════════════════════════════════════════════════════
// Confirmation lands on the NEW address, not the old one: clicking it is proof of
// ownership of the address being switched to, which is the same proof `email_verified_at`
// exists to record — so a successful confirm sets both the email column AND the
// verification timestamp in one step. See server/routes/auth/confirm-email-change.get.ts.

export const emailChangeTokens = mysqlTable(
  'email_change_tokens',
  {
    id: int('id').primaryKey().autoincrement(),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * The address being switched to. Stored in plain text (it is not a secret — it is
     * the destination of the mail this token was sent to) so the confirm step can act on
     * it without a second round trip through whatever else may have changed meanwhile.
     */
    newEmail: varchar('new_email', { length: 255 }).notNull(),
    tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
    expiresAt: datetime('expires_at').notNull(),
    usedAt: datetime('used_at'),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index('idx_email_change_tokens_user').on(table.userId)]
)

// ═══════════════════════════════════════════════════════════════
// PASSWORD RESET TOKENS
// ═══════════════════════════════════════════════════════════════

export const passwordResetTokens = mysqlTable(
  'password_reset_tokens',
  {
    id: int('id').primaryKey().autoincrement(),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
    expiresAt: datetime('expires_at').notNull(),
    usedAt: datetime('used_at'),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index('idx_reset_tokens_user').on(table.userId)]
)

// ═══════════════════════════════════════════════════════════════
// RATE LIMIT HITS (DB-backed — safe for multi-process Passenger)
// ═══════════════════════════════════════════════════════════════
// In-memory rate limiting is not safe when Passenger spawns multiple processes.
// This table replaces the in-memory Map with a DB counter per bucket+window.

export const rateLimitHits = mysqlTable(
  'rate_limit_hits',
  {
    id: int('id').primaryKey().autoincrement(),
    /** Composite key: "route:ip" e.g. "auth:login:1.2.3.4" */
    bucketKey: varchar('bucket_key', { length: 200 }).notNull(),
    /** Window start (UNIX seconds, truncated to window size) */
    windowStart: int('window_start').notNull(),
    count: int('count').notNull().default(1),
  },
  (table) => [uniqueIndex('idx_rate_limit_bucket_window').on(table.bucketKey, table.windowStart)]
)

// ═══════════════════════════════════════════════════════════════
// CONTACT MESSAGES (stored, no email send — SMTP not configured)
// ═══════════════════════════════════════════════════════════════

export const contactMessages = mysqlTable('contact_messages', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  message: text('message').notNull(),
  createdAt: datetime('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
})

/**
 * GDPR self-service requests (Art. 15 access / Art. 17 erasure).
 *
 * One row covers a whole flow. The same token is reused across both steps —
 * `confirmedAt` is what separates them — rather than issuing a second token:
 * the export link is also emailed, so it must stay valid for a while, and a
 * one-shot token would break the moment the browser fetched it first.
 *
 * Lifetime: 2h to confirm, then extended to 24h so the emailed export link
 * works for a day. Exports are generated on request and never written to disk,
 * so an expired token leaves nothing behind to clean up.
 */
export const dataRequests = mysqlTable(
  'data_requests',
  {
    id: int('id').primaryKey().autoincrement(),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: mysqlEnum('type', ['export', 'deletion']).notNull(),
    // sha256 of the raw token, never the token itself — same as the auth tables.
    tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
    expiresAt: datetime('expires_at').notNull(),
    confirmedAt: datetime('confirmed_at'),
    completedAt: datetime('completed_at'),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index('idx_data_requests_user').on(table.userId)]
)

// ═══════════════════════════════════════════════════════════════
// DRIZZLE RELATIONS
// ═══════════════════════════════════════════════════════════════

export const usersRelations = relations(users, ({ many }) => ({
  recipes: many(recipes),
  commits: many(recipeCommits),
  gourmergeRequests: many(gourmergeRequests),
  stars: many(recipeStars),
}))

export const ingredientsRelations = relations(ingredients, ({ one, many }) => ({
  nutrition: one(ingredientNutrition, { fields: [ingredients.id], references: [ingredientNutrition.ingredientId] }),
  commitIngredients: many(recipeCommitIngredients),
}))

export const ingredientNutritionRelations = relations(ingredientNutrition, ({ one }) => ({
  ingredient: one(ingredients, { fields: [ingredientNutrition.ingredientId], references: [ingredients.id] }),
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
  parent: one(recipeCommits, {
    fields: [recipeCommits.parentCommitId],
    references: [recipeCommits.id],
    relationName: 'commitChain',
  }),
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
  gourmergeRequest: one(gourmergeRequests, {
    fields: [gourmergeRequestComments.gourmergeRequestId],
    references: [gourmergeRequests.id],
  }),
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
