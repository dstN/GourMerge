/**
 * generateSlug — Create a URL-safe slug from a recipe title
 *
 * Converts "Omas Apfelkuchen 🍎" → "omas-apfelkuchen"
 * Handles German umlauts, special characters, and emoji.
 */

/** Map of common transliterations for German/European characters */
const charMap: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
  Ä: 'Ae',
  Ö: 'Oe',
  Ü: 'Ue',
  à: 'a',
  á: 'a',
  â: 'a',
  ã: 'a',
  è: 'e',
  é: 'e',
  ê: 'e',
  ë: 'e',
  ì: 'i',
  í: 'i',
  î: 'i',
  ï: 'i',
  ò: 'o',
  ó: 'o',
  ô: 'o',
  õ: 'o',
  ù: 'u',
  ú: 'u',
  û: 'u',
  ñ: 'n',
  ç: 'c',
}

/**
 * Recipe slugs share the `/:username/:slug` URL space with other static routes nested
 * under a username segment (e.g. `/:username/collections`). A recipe slug equal to one of
 * these would make that recipe permanently unreachable — Nuxt's file-based routing
 * prioritizes the static `collections` route over the dynamic `[slug]` one, so
 * `/alice/collections` always resolves to the collections list page, never to a recipe
 * whose slug happens to be "collections". Checked in the same uniqueness loop that already
 * exists in `recipes/index.post.ts` and `recipes/[id]/fork.post.ts` — a reserved slug is
 * treated exactly like an existing one, forcing the `-1`/`-2` suffix.
 */
export const RESERVED_RECIPE_SLUGS = new Set(['collections'])

/**
 * Generate a URL-safe slug from a string.
 *
 * @param input - Raw string (e.g. recipe title)
 * @returns URL-safe slug (e.g. "omas-apfelkuchen")
 */
export function generateSlug(input: string): string {
  return (
    input
      .trim()
      // Transliterate special characters
      .replace(/[äöüßÄÖÜàáâãèéêëìíîïòóôõùúûñç]/g, (char) => charMap[char] || char)
      // Remove emoji and other non-ASCII
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      // Convert to lowercase
      .toLowerCase()
      // Replace whitespace with hyphens
      .replace(/\s+/g, '-')
      // Collapse multiple hyphens
      .replace(/-+/g, '-')
      // Trim leading/trailing hyphens
      .replace(/^-+|-+$/g, '') ||
    // Fallback if everything was stripped
    'recipe'
  )
}
