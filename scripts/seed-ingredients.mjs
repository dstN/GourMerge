/**
 * Seed the ingredients master table with common cooking ingredients.
 *
 * Usage:
 *   node scripts/seed-ingredients.mjs
 *   node scripts/seed-ingredients.mjs --dry-run   (prints SQL, no writes)
 *
 * Requires DATABASE_URL to be set (e.g. via .env or shell).
 * Skips existing rows (dedupes by lowercase name).
 */

import { createConnection } from 'mysql2/promise'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDryRun = process.argv.includes('--dry-run')

// Load .env manually (no dotenv dep needed)
function loadEnv() {
  try {
    const envPath = resolve(__dirname, '../.env')
    const lines = readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* no .env file — rely on environment */ }
}
loadEnv()

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.')
  process.exit(1)
}

// ────────────────────────────────────────────────────────────
// Ingredient list: { name (EN canonical), de, category }
// ────────────────────────────────────────────────────────────
const INGREDIENTS = [
  // Flour & grains
  { name: 'flour',              de: 'Mehl',                    category: 'grain' },
  { name: 'wheat flour',        de: 'Weizenmehl',              category: 'grain' },
  { name: 'whole wheat flour',  de: 'Vollkornmehl',            category: 'grain' },
  { name: 'rye flour',          de: 'Roggenmehl',              category: 'grain' },
  { name: 'cornstarch',         de: 'Speisestärke',            category: 'grain' },
  { name: 'breadcrumbs',        de: 'Semmelbrösel',            category: 'grain' },
  { name: 'rolled oats',        de: 'Haferflocken',            category: 'grain' },
  { name: 'rice',               de: 'Reis',                    category: 'grain' },
  { name: 'pasta',              de: 'Nudeln',                  category: 'grain' },
  { name: 'semolina',           de: 'Grieß',                   category: 'grain' },

  // Dairy & eggs
  { name: 'egg',                de: 'Ei',                      category: 'dairy' },
  { name: 'eggs',               de: 'Eier',                    category: 'dairy' },
  { name: 'milk',               de: 'Milch',                   category: 'dairy' },
  { name: 'butter',             de: 'Butter',                  category: 'dairy' },
  { name: 'cream',              de: 'Sahne',                   category: 'dairy' },
  { name: 'heavy cream',        de: 'Schlagsahne',             category: 'dairy' },
  { name: 'sour cream',         de: 'Sauerrahm',               category: 'dairy' },
  { name: 'cream cheese',       de: 'Frischkäse',              category: 'dairy' },
  { name: 'yogurt',             de: 'Joghurt',                 category: 'dairy' },
  { name: 'quark',              de: 'Quark',                   category: 'dairy' },
  { name: 'cheese',             de: 'Käse',                    category: 'dairy' },
  { name: 'parmesan',           de: 'Parmesan',                category: 'dairy' },
  { name: 'mozzarella',         de: 'Mozzarella',              category: 'dairy' },
  { name: 'gouda',              de: 'Gouda',                   category: 'dairy' },
  { name: 'buttermilk',         de: 'Buttermilch',             category: 'dairy' },

  // Sweeteners & baking
  { name: 'sugar',              de: 'Zucker',                  category: 'baking' },
  { name: 'brown sugar',        de: 'Brauner Zucker',          category: 'baking' },
  { name: 'powdered sugar',     de: 'Puderzucker',             category: 'baking' },
  { name: 'vanilla sugar',      de: 'Vanillezucker',           category: 'baking' },
  { name: 'honey',              de: 'Honig',                   category: 'baking' },
  { name: 'baking powder',      de: 'Backpulver',              category: 'baking' },
  { name: 'baking soda',        de: 'Natron',                  category: 'baking' },
  { name: 'yeast',              de: 'Hefe',                    category: 'baking' },
  { name: 'dry yeast',          de: 'Trockenhefe',             category: 'baking' },
  { name: 'cocoa powder',       de: 'Kakaopulver',             category: 'baking' },
  { name: 'chocolate',          de: 'Schokolade',              category: 'baking' },
  { name: 'dark chocolate',     de: 'Zartbitterschokolade',    category: 'baking' },
  { name: 'vanilla extract',    de: 'Vanilleextrakt',          category: 'baking' },
  { name: 'maple syrup',        de: 'Ahornsirup',              category: 'baking' },

  // Fats & oils
  { name: 'olive oil',          de: 'Olivenöl',                category: 'oil' },
  { name: 'sunflower oil',      de: 'Sonnenblumenöl',          category: 'oil' },
  { name: 'vegetable oil',      de: 'Pflanzenöl',              category: 'oil' },
  { name: 'lard',               de: 'Schmalz',                 category: 'oil' },
  { name: 'margarine',          de: 'Margarine',               category: 'oil' },

  // Salt, spices & herbs
  { name: 'salt',               de: 'Salz',                    category: 'spice' },
  { name: 'pepper',             de: 'Pfeffer',                 category: 'spice' },
  { name: 'black pepper',       de: 'Schwarzer Pfeffer',       category: 'spice' },
  { name: 'chili flakes',       de: 'Chiliflocken',            category: 'spice' },
  { name: 'paprika',            de: 'Paprikapulver',           category: 'spice' },
  { name: 'smoked paprika',     de: 'Geräuchertes Paprikapulver', category: 'spice' },
  { name: 'cumin',              de: 'Kreuzkümmel',             category: 'spice' },
  { name: 'coriander',          de: 'Koriander',               category: 'spice' },
  { name: 'cinnamon',           de: 'Zimt',                    category: 'spice' },
  { name: 'nutmeg',             de: 'Muskatnuss',              category: 'spice' },
  { name: 'turmeric',           de: 'Kurkuma',                 category: 'spice' },
  { name: 'ginger',             de: 'Ingwer',                  category: 'spice' },
  { name: 'garlic powder',      de: 'Knoblauchpulver',         category: 'spice' },
  { name: 'oregano',            de: 'Oregano',                 category: 'herb' },
  { name: 'thyme',              de: 'Thymian',                 category: 'herb' },
  { name: 'rosemary',           de: 'Rosmarin',                category: 'herb' },
  { name: 'basil',              de: 'Basilikum',               category: 'herb' },
  { name: 'parsley',            de: 'Petersilie',              category: 'herb' },
  { name: 'chives',             de: 'Schnittlauch',            category: 'herb' },
  { name: 'bay leaf',           de: 'Lorbeerblatt',            category: 'herb' },
  { name: 'dill',               de: 'Dill',                    category: 'herb' },
  { name: 'mint',               de: 'Minze',                   category: 'herb' },

  // Vegetables
  { name: 'onion',              de: 'Zwiebel',                 category: 'vegetable' },
  { name: 'garlic',             de: 'Knoblauch',               category: 'vegetable' },
  { name: 'carrot',             de: 'Karotte',                 category: 'vegetable' },
  { name: 'potato',             de: 'Kartoffel',               category: 'vegetable' },
  { name: 'tomato',             de: 'Tomate',                  category: 'vegetable' },
  { name: 'bell pepper',        de: 'Paprika',                 category: 'vegetable' },
  { name: 'zucchini',           de: 'Zucchini',                category: 'vegetable' },
  { name: 'eggplant',           de: 'Aubergine',               category: 'vegetable' },
  { name: 'spinach',            de: 'Spinat',                  category: 'vegetable' },
  { name: 'broccoli',           de: 'Brokkoli',                category: 'vegetable' },
  { name: 'cauliflower',        de: 'Blumenkohl',              category: 'vegetable' },
  { name: 'cabbage',            de: 'Kohl',                    category: 'vegetable' },
  { name: 'leek',               de: 'Lauch',                   category: 'vegetable' },
  { name: 'celery',             de: 'Sellerie',                category: 'vegetable' },
  { name: 'mushroom',           de: 'Pilz',                    category: 'vegetable' },
  { name: 'corn',               de: 'Mais',                    category: 'vegetable' },
  { name: 'peas',               de: 'Erbsen',                  category: 'vegetable' },
  { name: 'green beans',        de: 'Grüne Bohnen',            category: 'vegetable' },
  { name: 'cucumber',           de: 'Gurke',                   category: 'vegetable' },
  { name: 'lettuce',            de: 'Salat',                   category: 'vegetable' },

  // Fruits
  { name: 'apple',              de: 'Apfel',                   category: 'fruit' },
  { name: 'lemon',              de: 'Zitrone',                 category: 'fruit' },
  { name: 'orange',             de: 'Orange',                  category: 'fruit' },
  { name: 'banana',             de: 'Banane',                  category: 'fruit' },
  { name: 'strawberry',         de: 'Erdbeere',                category: 'fruit' },
  { name: 'raspberry',          de: 'Himbeere',                category: 'fruit' },
  { name: 'blueberry',          de: 'Heidelbeere',             category: 'fruit' },
  { name: 'lemon juice',        de: 'Zitronensaft',            category: 'fruit' },
  { name: 'lime',               de: 'Limette',                 category: 'fruit' },

  // Meat & fish
  { name: 'chicken breast',     de: 'Hähnchenbrust',           category: 'meat' },
  { name: 'minced meat',        de: 'Hackfleisch',             category: 'meat' },
  { name: 'beef',               de: 'Rindfleisch',             category: 'meat' },
  { name: 'pork',               de: 'Schweinefleisch',         category: 'meat' },
  { name: 'bacon',              de: 'Speck',                   category: 'meat' },
  { name: 'sausage',            de: 'Wurst',                   category: 'meat' },
  { name: 'salmon',             de: 'Lachs',                   category: 'fish' },
  { name: 'tuna',               de: 'Thunfisch',               category: 'fish' },

  // Legumes & nuts
  { name: 'chickpeas',          de: 'Kichererbsen',            category: 'legume' },
  { name: 'lentils',            de: 'Linsen',                  category: 'legume' },
  { name: 'kidney beans',       de: 'Kidneybohnen',            category: 'legume' },
  { name: 'almonds',            de: 'Mandeln',                 category: 'nut' },
  { name: 'walnuts',            de: 'Walnüsse',                category: 'nut' },
  { name: 'hazelnuts',          de: 'Haselnüsse',              category: 'nut' },

  // Liquids & sauces
  { name: 'water',              de: 'Wasser',                  category: 'liquid' },
  { name: 'vegetable broth',    de: 'Gemüsebrühe',             category: 'liquid' },
  { name: 'chicken broth',      de: 'Hühnerbrühe',             category: 'liquid' },
  { name: 'red wine',           de: 'Rotwein',                 category: 'liquid' },
  { name: 'white wine',         de: 'Weißwein',                category: 'liquid' },
  { name: 'soy sauce',          de: 'Sojasoße',                category: 'sauce' },
  { name: 'tomato paste',       de: 'Tomatenmark',             category: 'sauce' },
  { name: 'vinegar',            de: 'Essig',                   category: 'sauce' },
  { name: 'mustard',            de: 'Senf',                    category: 'sauce' },
  { name: 'ketchup',            de: 'Ketchup',                 category: 'sauce' },
]

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────
const conn = await createConnection(DATABASE_URL)

try {
  let inserted = 0
  let skipped = 0

  for (const ing of INGREDIENTS) {
    const nameTranslations = JSON.stringify({ en: ing.name, de: ing.de })

    if (isDryRun) {
      console.log(`DRY-RUN: INSERT "${ing.name}" (${ing.de}) [${ing.category}]`)
      continue
    }

    const [existing] = await conn.execute(
      'SELECT id FROM ingredients WHERE LOWER(name) = LOWER(?)',
      [ing.name]
    )
    if (existing.length > 0) {
      skipped++
      continue
    }

    await conn.execute(
      'INSERT INTO ingredients (name, name_translations, category) VALUES (?, ?, ?)',
      [ing.name, nameTranslations, ing.category]
    )
    inserted++
  }

  if (!isDryRun) {
    console.log(`✓ Seeded ${inserted} ingredients, skipped ${skipped} existing`)
  } else {
    console.log(`DRY-RUN complete — ${INGREDIENTS.length} ingredients would be processed`)
  }
} finally {
  await conn.end()
}
