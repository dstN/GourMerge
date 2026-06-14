# GourMerge — Status Audit, Swiss Nutrition Integration, 4-Language Catalog & Logo Rollout

## Context

Three workstreams:

1. **Status audit** — document what's implemented vs. what ROADMAP.md/ARCHITECTURE.md still call for.
2. **Ingredient + nutrition integration** — build a rich, multilingual ingredient catalog from the **Swiss BLV Food Composition Database**, with per-100g nutrition facts, and **show aggregated nutrition per recipe / per serving**. Natural ingredients first; branded products later (from Open Food Facts).
3. **Logo rollout** — replace the Lucide `chef-hat` brand mark and previously generated icons with the official `public/logo_gourmerge.svg`, rendered as an **orange glyph on a transparent background** everywhere.

### Key research findings

- The app is **~77% of roadmap**, all core features built (TipTap+ingredient editor, snapshot commits, branches, three-way merge, GourMerge Requests, fork/stars/profiles/explore/tags, auth hardening, PWA, CI/CD).
- `ingredients` has **no nutrition columns** today: `id, name, nameTranslations (JSON), category, createdAt`.
- **Data source = Swiss BLV Food Composition Database V7.0** (`.claude/data/swiss/Schweizer_Nahrwertdatenbank.xlsx`):
  - Sheet **"Generische Lebensmittel"** = ~1190 generic/raw foods → naturals source. Per-100g-edible basis. Missing values = `k.A.` → null.
  - Stable `ID` column (A) is the **join key across the 4 language exports**.
  - Key columns: `Name` (D), `Synonyme` (E), `Kategorie` (F, hierarchical), **`Dichte`/density** (G), nutrient triplets (value | Herleitung | Quelle): kJ, kcal, fat/sat/mono/poly, carbs, sugar, starch, fiber, protein, salt, alcohol, water, + vitamins/minerals.
  - **Sheet "Markenprodukte"** has only ~30 entries → OFF CSV (13 GB) remains the source for processed products later.
  - The current file is **German-only**; EN/FR/IT exports join on the same ID column.
- **OFF CSV is unsuitable for naturals**: no German names, sparse nutrition, product/barcode-centric.

### Decisions confirmed

- **Catalog:** full Swiss generic-foods catalog (~1190) — all variants searchable via name + `Synonyme`.
- **Languages:** 4 languages (de/en/fr/it). Ingredient names from all 4 Swiss exports joined by ID. App UI also expands to 4 full locales.
- **Nutrition schema:** separate `ingredient_nutrition` table (1:1 with `ingredients`).
- **Nutrition scope:** store **and** show per-recipe / per-serving totals.
- **Logo:** orange glyph, transparent background.

---

## Part 0 — Bug fixes (FIRST)

### 0a. Empty authed recipe list
The query in `server/api/recipes/index.get.ts` is logically correct; the failure is at the **session/SSR boundary**. `dashboard.vue` silently shows the empty state on any error (it destructures only `data, pending`, never `error`).

Fix steps:
1. Diagnose: `GET /api/recipes` → `401` = SSR session not readable; `200 []` = data/ownership mismatch.
2. If 401: verify `NUXT_SESSION_PASSWORD` is set (≥32 chars) in `.env` — falls back to `''` which invalidates SSR session unseal. Confirm `auth` middleware exists.
3. If 200 []: `ownerId` ≠ `session.user.id` (DB reseed mismatch).
4. Regardless: surface `error` in `dashboard.vue` (show error card instead of empty state).

### 0b. "My Recipes" nav + dedicated page
`DashboardSidebar.vue` uses `to: '/dashboard'` for "My Recipes" — wrong. Create `app/pages/recipes/index.vue` and point nav at `/recipes`.

---

## Part A — Implementation Status Document

Deliverable: **`.claude/STATUS.md`** with phase-by-phase (P0–P6) table: Implemented / Partial / Missing, each citing the evidence file.

---

## Part B — Swiss Ingredient Catalog & Nutrition

### B1. Schema — `ingredient_nutrition` table

Add to `server/database/schema.ts`, then `npm run db:generate` → `0002_ingredient-nutrition.sql`.

Columns:
- `ingredientId` int PK + FK → `ingredients.id` (cascade), unique (1:1)
- Core per-100g, nullable `decimal(8,2)`: `energyKcal100g`, `energyKj100g`, `protein100g`, `carbs100g`, `sugars100g`, `starch100g`, `fat100g`, `saturatedFat100g`, `fiber100g`, `salt100g`, `alcohol100g`, `water100g`
- `micros` JSON — vitamins/minerals long-tail
- `densityGPerMl` decimal nullable (Swiss `Dichte`)
- `gramsPerPiece` int nullable (egg etc.)
- `source` varchar (`'swiss-blv-v7'`), `externalId` varchar (Swiss `ID`), `createdAt`, `updatedAt`

Also add `synonyms` JSON to `ingredients` table (per-locale synonym arrays from Swiss `Synonyme`).

### B2. Swiss importer (`scripts/import-swiss-foods.mjs`)

- SheetJS `xlsx` for robust XLSX parsing (add as dev dep)
- Reuse `.env` loader + `--dry-run` pattern from `seed-ingredients.mjs`
- Read all language files present in `.claude/data/swiss/`, parse "Generische Lebensmittel", join by `ID` column
- Map columns: `Name`→names, `Kategorie`→category, `Dichte`→`densityGPerMl`, nutrients→`ingredient_nutrition`. `k.A.`→null; round float artifacts to 2dp
- Upsert keyed by `(source, externalId)`. Add `npm run seed:swiss`
- Canonical `ingredients.name` = EN name when available, else DE

### B3. Search API

Extend `GET /api/ingredients`: left-join `ingredient_nutrition`, search synonyms + all 4 locale names, include compact `nutrition` object + `hasNutrition` flag.

---

## Part C — Per-recipe / per-serving Nutrition Totals

- `server/utils/nutrition.ts`: sum nutrients from commit ingredients × per-100g values. Convert units via `server/utils/units.ts`: `g` direct; `ml`→g via `densityGPerMl`; `tsp`/`tbsp`/`pinch`→ml; `piece`→`gramsPerPiece`. Track coverage, return approximate flag + uncovered count. Divide by servings for per-serving.
- Compute in recipe-detail server route; client recomputes per-serving from base.
- `app/components/recipe/NutritionFacts.vue`: kcal + macros per serving/recipe, approximate disclaimer. i18n keys in all 4 locales.
- Unit test for `nutrition.ts`.

---

## Part D — Expand UI to 4 Locales (de/en/fr/it)

- `nuxt.config.ts`: register `fr` + `it` locales and route prefixes
- Create `fr.json` + `it.json` mirroring all keys in `de.json`/`en.json`
- Extend `scripts/i18n-check.mjs` from 2-way to 4-way parity
- Add FR + IT to locale switcher UI in header/settings

---

## Part E — Official Logo Rollout (orange glyph, transparent bg)

### E1. Brand component
- `app/components/common/BrandLogo.vue`: inlines SVG paths with `fill="currentColor"`, size prop, default `text-primary-500`
- Replace 7 `i-lucide-chef-hat` brand usages: `layouts/default.vue:27`, `layouts/dashboard.vue:18`, `layouts/auth.vue:14`, `error.vue:55`, `pages/index.vue:153` (+hero/CTA), `pages/recipes/new.vue:95`

### E2. Favicon + PWA assets
- `scripts/generate-icons.mjs` using `sharp`/`resvg`, orange `#f97316`, transparent bg
- Regenerate: `public/favicon.svg`, `public/icon.svg`, `public/favicon.ico`, `public/pwa-{64,192,512}.png`, `public/apple-touch-icon-180x180.png`, `public/maskable-icon-512x512.png` (maskable: ~15-20% safe-zone padding)

---

## Future — Branded products from OFF

Streaming `readline` importer over 13 GB OFF CSV. Documented as follow-up in STATUS.md/ROADMAP.

---

## Execution order

1. Bug fixes (Part 0)
2. Logo (Part E) — self-contained
3. Schema + Swiss importer (Part B1–B2)
4. Search API + nutrition totals (Part B3 + C)
5. 4-locale UI (Part D)
6. STATUS.md (Part A)

## Verification

- Migration: `npm run db:generate` + apply; confirm table + FK cascade
- Import: `node scripts/import-swiss-foods.mjs --dry-run` then real; spot-check nutrition values
- API: `GET /api/ingredients?q=Ei&locale=de` returns all egg variants with nutrition
- Totals: `NutritionFacts.vue` shows plausible per-serving values; approximate note when data missing
- i18n: `node scripts/i18n-check.mjs` passes 4-way; FR/IT pages render
- Logo: orange brand mark in header/dashboard/auth/error/landing; favicon + PWA icon correct
- `npm run lint` + `npm run build` clean
