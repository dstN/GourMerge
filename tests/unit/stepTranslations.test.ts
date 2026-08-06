import { describe, test, expect } from 'vitest'

/**
 * The two rules behind the translation panel on the recipe editor, extracted here because
 * they are pure decisions and they got the semantics wrong once already.
 *
 * Recipes saved before the locale badge landed contain `content_translations.de` that is
 * byte-for-byte equal to `content` — a duplicate, not an override. The first attempt showed
 * the author's own language whenever *any* value existed, which meant those recipes rendered
 * the same German text twice: once in the main editor, once as its own "translation".
 *
 * These mirror `localesFor` / `stripRedundant` in `pages/[username]/[slug]/edit.vue`.
 */
const LOCALES = ['de', 'en', 'fr', 'it'] as const
type Locale = (typeof LOCALES)[number]

function localesFor(own: Locale, ...fields: Array<{ main: string; map: Partial<Record<Locale, string>> }>): Locale[] {
  return LOCALES.filter(
    (l) =>
      l !== own ||
      fields.some(({ main, map }) => {
        const value = (map[l] ?? '').trim()
        return value !== '' && value !== (main ?? '').trim()
      })
  )
}

function stripRedundant(main: string, map: Partial<Record<Locale, string>>): Record<string, string> | null {
  const base = (main ?? '').trim()
  const kept = Object.fromEntries(
    Object.entries(map).filter(([, v]) => {
      const value = (v ?? '').trim()
      return value !== '' && value !== base
    })
  )
  return Object.keys(kept).length > 0 ? kept : null
}

const empty = { de: '', en: '', fr: '', it: '' }

describe('localesFor — which languages the panel offers', () => {
  test('omits the working language when nothing is stored for it', () => {
    expect(localesFor('de', { main: 'Anbraten.', map: empty })).toEqual(['en', 'fr', 'it'])
  })

  test('omits it when the stored value merely repeats the main text', () => {
    // The reported bug: DE shown twice, identical, for every step of an older recipe.
    const main = '<p>Nehmen Sie den Topf vom Herd.</p>'
    expect(localesFor('de', { main, map: { ...empty, de: main } })).toEqual(['en', 'fr', 'it'])
  })

  test('ignores whitespace-only differences', () => {
    const main = 'Anbraten.'
    expect(localesFor('de', { main, map: { ...empty, de: '  Anbraten.  ' } })).toEqual(['en', 'fr', 'it'])
  })

  test('keeps it when the stored value genuinely differs', () => {
    // This one really is overriding the main text for German readers, so hiding it would
    // leave an active override that cannot be edited or cleared.
    expect(localesFor('de', { main: 'Anbraten.', map: { ...empty, de: 'Scharf anbraten.' } })).toEqual([
      'de',
      'en',
      'fr',
      'it',
    ])
  })

  test('the working language follows the UI locale', () => {
    expect(localesFor('fr', { main: 'x', map: empty })).toEqual(['de', 'en', 'it'])
    expect(localesFor('it', { main: 'x', map: empty })).toEqual(['de', 'en', 'fr'])
  })

  test('any one of several fields can justify keeping it', () => {
    // Title identical but description different → DE must stay visible.
    const shown = localesFor(
      'de',
      { main: 'Titel', map: { ...empty, de: 'Titel' } },
      { main: 'Beschreibung', map: { ...empty, de: 'Andere Beschreibung' } }
    )
    expect(shown).toContain('de')
  })
})

describe('stripRedundant — what gets saved', () => {
  test('drops a translation identical to the main text', () => {
    const main = 'Anbraten.'
    expect(stripRedundant(main, { ...empty, de: main })).toBeNull()
  })

  test('drops identical copies in any locale, not just the working one', () => {
    // Safe because the read path falls back to `content` when a translation is absent,
    // so the rendered output is unchanged — it just stops shadowing later edits.
    const main = 'Anbraten.'
    expect(stripRedundant(main, { de: main, en: main, fr: 'Faire revenir.', it: '' })).toEqual({
      fr: 'Faire revenir.',
    })
  })

  test('keeps real translations', () => {
    expect(stripRedundant('Anbraten.', { ...empty, en: 'Sear.', fr: 'Faire revenir.' })).toEqual({
      en: 'Sear.',
      fr: 'Faire revenir.',
    })
  })

  test('returns null rather than an empty object', () => {
    // The column is nullable and the API expects null for "no translations"; `{}` would
    // store an empty JSON object that reads as present-but-blank.
    expect(stripRedundant('Anbraten.', empty)).toBeNull()
  })

  test('an empty main text does not swallow real translations', () => {
    expect(stripRedundant('', { ...empty, en: 'Sear.' })).toEqual({ en: 'Sear.' })
  })
})
