#!/usr/bin/env node
/**
 * seed-tour-recipe.mjs — Seed the `system` user and a demo recipe for the onboarding tour.
 *
 * The `system` user is never loginable (password_hash is a sentinel no bcrypt
 * comparison can match, same pattern as `ghost`). The recipe is a real Klassische
 * Tomatensuppe with Swiss-BLV ingredients, 4-locale translations and 3 steps.
 *
 * The recipe is **public** so the explore API can serve it to users who haven't
 * finished the tour yet. Users who have (`has_finished_tour = 1`) and guests
 * never see it — the explore endpoint filters it out.
 *
 * Idempotent: re-running updates nothing if the rows already exist.
 *
 * Usage:
 *   node scripts/seed-tour-recipe.mjs
 *   npm run db:seed:tour
 */
import 'dotenv/config'
import mysql from 'mysql2/promise'
import crypto from 'node:crypto'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set — aborting.')
  process.exit(1)
}

const conn = await mysql.createConnection(DATABASE_URL)

try {
  // ── 1. System user ──────────────────────────────────────────────
  const SYSTEM_USERNAME = 'system'
  // Sentinel hash that no password can produce (same approach as `ghost`).
  const SENTINEL_HASH = '$2b$10$SYSTEM_USER_NOT_LOGINABLE_SENTINEL_HASH_VALUE_NO_MATCH_EVER'

  const [existingUser] = await conn.execute(
    'SELECT id FROM users WHERE username = ?',
    [SYSTEM_USERNAME]
  )

  let systemUserId
  if (/** @type {any[]} */ (existingUser).length > 0) {
    systemUserId = /** @type {any} */ (existingUser)[0].id
    console.log(`  ✓ system user already exists (id=${systemUserId})`)
  } else {
    const [result] = await conn.execute(
      `INSERT INTO users (username, display_name, email, password_hash, preferred_locale, is_ghost)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [SYSTEM_USERNAME, 'GourMerge', 'system@gourmerge.local', SENTINEL_HASH, 'de', false]
    )
    systemUserId = /** @type {any} */ (result).insertId
    console.log(`  ✓ system user created (id=${systemUserId})`)
  }

  // ── 2. Tour recipe ──────────────────────────────────────────────
  const RECIPE_SLUG = 'klassische-tomatensuppe'
  const [existingRecipe] = await conn.execute(
    'SELECT id FROM recipes WHERE owner_id = ? AND slug = ?',
    [systemUserId, RECIPE_SLUG]
  )

  if (/** @type {any[]} */ (existingRecipe).length > 0) {
    console.log(`  ✓ tour recipe already exists (id=${/** @type {any} */(existingRecipe)[0].id})`)
    await conn.end()
    process.exit(0)
  }

  // UUIDv7 for public_id
  const publicId = crypto.randomBytes(16)
  // Set version 7 (bits 48-51)
  publicId[6] = (publicId[6] & 0x0f) | 0x70
  // Set variant (bits 64-65)
  publicId[8] = (publicId[8] & 0x3f) | 0x80

  const [recipeResult] = await conn.execute(
    `INSERT INTO recipes (
       public_id, owner_id, title, slug, description, visibility,
       servings, prep_time_minutes, cook_time_minutes, difficulty,
       dietary_type, title_translations, description_translations,
       star_count, fork_count
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      publicId,
      systemUserId,
      'Klassische Tomatensuppe',
      RECIPE_SLUG,
      'Eine wärmende, samtige Tomatensuppe — perfekt als leichtes Mittagessen oder Vorspeise. Frische Tomaten, Zwiebeln und Basilikum ergeben einen Klassiker, der immer schmeckt.',
      'public',
      4,    // servings
      10,   // prep_time_minutes
      25,   // cook_time_minutes
      'easy',
      'vegetarian',
      JSON.stringify({
        en: 'Classic Tomato Soup',
        fr: 'Soupe classique à la tomate',
        it: 'Zuppa classica di pomodoro',
      }),
      JSON.stringify({
        en: 'A warming, velvety tomato soup — perfect as a light lunch or starter. Fresh tomatoes, onions and basil make a classic that never disappoints.',
        fr: 'Un velouté de tomates réconfortant — parfait en entrée ou en plat léger. Tomates fraîches, oignons et basilic pour un classique qui plaît toujours.',
        it: 'Una vellutata di pomodoro calda e avvolgente — perfetta come pranzo leggero o antipasto. Pomodori freschi, cipolle e basilico per un classico che non delude mai.',
      }),
      0,
      0,
    ]
  )
  const recipeId = /** @type {any} */ (recipeResult).insertId
  console.log(`  ✓ tour recipe created (id=${recipeId})`)

  // ── 3. Default branch ──────────────────────────────────────────
  const [branchResult] = await conn.execute(
    `INSERT INTO recipe_branches (recipe_id, name, is_default) VALUES (?, ?, ?)`,
    [recipeId, 'main', true]
  )
  const branchId = /** @type {any} */ (branchResult).insertId

  // ── 4. Initial commit ──────────────────────────────────────────
  const [commitResult] = await conn.execute(
    `INSERT INTO recipe_commits (branch_id, author_id, message, is_merge) VALUES (?, ?, ?, ?)`,
    [branchId, systemUserId, 'Erstes Rezept', false]
  )
  const commitId = /** @type {any} */ (commitResult).insertId

  // Point branch head to the commit
  await conn.execute(
    `UPDATE recipe_branches SET head_commit_id = ? WHERE id = ?`,
    [commitId, branchId]
  )

  // ── 5. Ingredients ──────────────────────────────────────────────
  // Look up Swiss-BLV ingredients by German name (they are already seeded).
  // Fall back to name search for each.
  const ingredientData = [
    { nameDe: 'Tomate',       qty: '800', unit: 'g',     notes: 'reif, gewürfelt',     notesTr: { en: 'ripe, diced', fr: 'mûres, en dés', it: 'maturi, a cubetti' } },
    { nameDe: 'Zwiebel',      qty: '1',   unit: 'piece', notes: 'fein gehackt',        notesTr: { en: 'finely chopped', fr: 'finement hachée', it: 'tritata finemente' } },
    { nameDe: 'Knoblauch',    qty: '2',   unit: 'piece', notes: 'Zehen, gepresst',     notesTr: { en: 'cloves, pressed', fr: 'gousses, pressées', it: 'spicchi, schiacciati' } },
    { nameDe: 'Olivenöl',     qty: '2',   unit: 'tbsp',  notes: null,                  notesTr: null },
    { nameDe: 'Basilikum',    qty: '1',   unit: 'pinch', notes: 'frisch, in Streifen', notesTr: { en: 'fresh, sliced', fr: 'frais, en chiffonnade', it: 'fresco, a listarelle' } },
    { nameDe: 'Salz',         qty: '1',   unit: 'pinch', notes: null,                  notesTr: null },
    { nameDe: 'Pfeffer',      qty: '1',   unit: 'pinch', notes: 'schwarz, frisch gemahlen', notesTr: { en: 'black, freshly ground', fr: 'noir, fraîchement moulu', it: 'nero, appena macinato' } },
  ]

  for (let i = 0; i < ingredientData.length; i++) {
    const ing = ingredientData[i]
    // Try to find ingredient by German name in translations or canonical name
    const [rows] = await conn.execute(
      `SELECT id FROM ingredients
       WHERE name LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(name_translations, '$.de')) LIKE ?
       LIMIT 1`,
      [`%${ing.nameDe}%`, `%${ing.nameDe}%`]
    )

    let ingredientId
    if (/** @type {any[]} */ (rows).length > 0) {
      ingredientId = /** @type {any} */ (rows)[0].id
    } else {
      // Create a minimal ingredient if not found in BLV
      const [insertResult] = await conn.execute(
        `INSERT INTO ingredients (name, name_translations, category) VALUES (?, ?, ?)`,
        [ing.nameDe, JSON.stringify({ de: ing.nameDe }), 'misc']
      )
      ingredientId = /** @type {any} */ (insertResult).insertId
      console.log(`    ⚠ created ingredient "${ing.nameDe}" (not found in BLV)`)
    }

    await conn.execute(
      `INSERT INTO recipe_commit_ingredients
       (commit_id, ingredient_id, quantity, unit, notes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [commitId, ingredientId, ing.qty, ing.unit, ing.notes, i]
    )
  }
  console.log(`  ✓ ${ingredientData.length} ingredients linked`)

  // ── 6. Steps (with 4-locale translations) ──────────────────────
  const steps = [
    {
      content: 'Olivenöl in einem grossen Topf bei mittlerer Hitze erwärmen. Zwiebel und Knoblauch darin 2–3 Minuten glasig dünsten, bis sie duften.',
      translations: {
        en: 'Heat olive oil in a large pot over medium heat. Sauté the onion and garlic for 2–3 minutes until translucent and fragrant.',
        fr: "Chauffer l'huile d'olive dans une grande casserole à feu moyen. Faire revenir l'oignon et l'ail 2 à 3 minutes jusqu'à ce qu'ils soient translucides et parfumés.",
        it: "Scaldare l'olio d'oliva in una pentola capiente a fuoco medio. Soffriggere la cipolla e l'aglio per 2–3 minuti finché saranno trasparenti e profumati.",
      },
    },
    {
      content: 'Die gewürfelten Tomaten hinzufügen und alles 15–20 Minuten köcheln lassen, bis die Tomaten zerfallen sind. Mit Salz und Pfeffer abschmecken.',
      translations: {
        en: 'Add the diced tomatoes and let everything simmer for 15–20 minutes until the tomatoes have broken down. Season with salt and pepper.',
        fr: 'Ajouter les tomates en dés et laisser mijoter 15 à 20 minutes jusqu\'à ce que les tomates soient fondues. Assaisonner de sel et de poivre.',
        it: 'Aggiungere i pomodori a cubetti e lasciar sobbollire per 15–20 minuti finché i pomodori si saranno disfatti. Condire con sale e pepe.',
      },
    },
    {
      content: 'Die Suppe mit einem Stabmixer fein pürieren oder in Stücken lassen. Mit frischem Basilikum garnieren und heiss servieren. Dazu passt frisches Brot.',
      translations: {
        en: 'Blend the soup until smooth with a stick blender, or leave chunky. Garnish with fresh basil and serve hot. Best with crusty bread.',
        fr: 'Mixer la soupe au mixeur plongeant jusqu\'à obtenir une texture lisse, ou la laisser en morceaux. Garnir de basilic frais et servir chaud. Accompagner de pain frais.',
        it: 'Frullare la zuppa con un frullatore a immersione fino a ottenere una consistenza liscia, oppure lasciarla a pezzi. Guarnire con basilico fresco e servire calda. Ottima con pane croccante.',
      },
    },
  ]

  for (let i = 0; i < steps.length; i++) {
    await conn.execute(
      `INSERT INTO recipe_commit_steps (commit_id, sort_order, content, content_translations)
       VALUES (?, ?, ?, ?)`,
      [commitId, i, steps[i].content, JSON.stringify(steps[i].translations)]
    )
  }
  console.log(`  ✓ ${steps.length} steps with translations created`)

  // ── 7. Tags ──────────────────────────────────────────────────────
  const tagNames = ['Suppe', 'Vegetarisch']
  for (const tagName of tagNames) {
    const [tagRows] = await conn.execute(
      'SELECT id FROM tags WHERE name = ?',
      [tagName]
    )
    if (/** @type {any[]} */ (tagRows).length > 0) {
      await conn.execute(
        `INSERT IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)`,
        [recipeId, /** @type {any} */ (tagRows)[0].id]
      )
    }
  }
  console.log(`  ✓ tags linked`)

  console.log('\n✅ Tour recipe seed complete.')
} finally {
  await conn.end()
}
