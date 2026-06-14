/**
 * generateSlug — Create a URL-safe slug from a recipe title
 *
 * Converts "Omas Apfelkuchen 🍎" → "omas-apfelkuchen"
 * Handles German umlauts, special characters, and emoji.
 */

/** Map of common transliterations for German/European characters */
const charMap: Record<string, string> = {
  ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss',
  Ä: 'Ae', Ö: 'Oe', Ü: 'Ue',
  à: 'a', á: 'a', â: 'a', ã: 'a',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ò: 'o', ó: 'o', ô: 'o', õ: 'o',
  ù: 'u', ú: 'u', û: 'u',
  ñ: 'n', ç: 'c',
}

/**
 * Generate a URL-safe slug from a string.
 *
 * @param input - Raw string (e.g. recipe title)
 * @returns URL-safe slug (e.g. "omas-apfelkuchen")
 */
export function generateSlug(input: string): string {
  return input
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
    .replace(/^-+|-+$/g, '')
    // Fallback if everything was stripped
    || 'recipe'
}
