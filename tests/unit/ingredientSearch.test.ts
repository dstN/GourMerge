import { describe, it, expect } from 'vitest'
import { normalizeSearchTerm, searchWords, searchTermsForIngredient } from '~~/shared/utils/ingredientSearch'

describe('normalizeSearchTerm', () => {
  it('lower-cases and drops punctuation, keeping single spaces between words', () => {
    expect(normalizeSearchTerm('Weizen Mehl, Type 405')).toBe('weizen mehl type 405')
    expect(normalizeSearchTerm('  Tomate,  roh ')).toBe('tomate roh')
    expect(normalizeSearchTerm('Roquefort mind. 50 % Fett i. Tr.')).toBe('roquefort mind 50 fett i tr')
  })

  it('folds umlauts, their two-letter spellings and accents to the same string', () => {
    // The three spellings a German user might type for the same vegetable.
    expect(normalizeSearchTerm('Möhre')).toBe('mohre')
    expect(normalizeSearchTerm('Moehre')).toBe('mohre')
    expect(normalizeSearchTerm('Mohre')).toBe('mohre')
    expect(normalizeSearchTerm('Hähnchen')).toBe(normalizeSearchTerm('Haehnchen'))
    expect(normalizeSearchTerm('Süßigkeiten')).toBe('sussigkeiten')
    expect(normalizeSearchTerm('Crème fraîche')).toBe('creme fraiche')
    expect(normalizeSearchTerm('œuf')).toBe('ouf')
  })

  it('does not treat the "ue" in "qu" as an umlaut', () => {
    expect(normalizeSearchTerm('Queso')).toBe('queso')
    expect(normalizeSearchTerm('Roquefort')).toBe('roquefort')
  })

  it('splits slash alternatives into separate words so either side is a word prefix', () => {
    expect(normalizeSearchTerm('Karotte/Möhre, roh')).toBe('karotte mohre roh')
  })

  it('returns an empty string for input with nothing searchable in it', () => {
    expect(normalizeSearchTerm('')).toBe('')
    expect(normalizeSearchTerm(' , / - ')).toBe('')
  })
})

describe('searchWords', () => {
  it('returns the normalised words of a query, and nothing for an empty one', () => {
    expect(searchWords('Weizen-Mehl 405')).toEqual(['weizen', 'mehl', '405'])
    expect(searchWords('   ')).toEqual([])
  })
})

describe('searchTermsForIngredient', () => {
  it('emits one row per locale name and per synonym, with the compact form alongside', () => {
    const terms = searchTermsForIngredient({
      name: 'Carrot, raw',
      nameTranslations: { de: 'Karotte, roh', en: 'Carrot, raw', fr: 'Carotte, crue', it: 'Carota, cruda' },
      synonyms: { de: ['Rüebli', 'Möhre'] },
    })

    expect(terms).toEqual([
      { locale: 'de', kind: 'name', term: 'karotte roh', compact: 'karotteroh' },
      { locale: 'en', kind: 'name', term: 'carrot raw', compact: 'carrotraw' },
      { locale: 'fr', kind: 'name', term: 'carotte cru', compact: 'carottecru' },
      { locale: 'it', kind: 'name', term: 'carota cruda', compact: 'carotacruda' },
      { locale: 'de', kind: 'synonym', term: 'rubli', compact: 'rubli' },
      { locale: 'de', kind: 'synonym', term: 'mohre', compact: 'mohre' },
    ])
  })

  it('adds the canonical name with no locale only when no translation already normalises to it', () => {
    // Canonical English name that IS the EN translation → no extra row.
    const covered = searchTermsForIngredient({
      name: 'Vanilla Sugar',
      nameTranslations: { de: 'Vanillezucker', en: 'Vanilla Sugar' },
    })
    expect(covered.filter((t) => t.locale === null)).toEqual([])

    // A user-typed name with no translations at all → that name is the only row, locale unknown.
    const bare = searchTermsForIngredient({ name: 'Spec Zutat' })
    expect(bare).toEqual([{ locale: null, kind: 'name', term: 'spec zutat', compact: 'speczutat' }])
  })

  it('deduplicates per (locale, term) and skips empty strings', () => {
    const terms = searchTermsForIngredient({
      name: 'Salt',
      nameTranslations: { de: 'Salz', en: 'Salt' },
      synonyms: { de: ['Salz', 'salz!', '', 'Kochsalz'] },
    })
    const deTerms = terms.filter((t) => t.locale === 'de').map((t) => `${t.kind}:${t.term}`)
    expect(deTerms).toEqual(['name:salz', 'synonym:kochsalz'])
  })

  it('tolerates missing or malformed translation/synonym blobs', () => {
    expect(searchTermsForIngredient({ name: 'X', nameTranslations: null, synonyms: null })).toEqual([
      { locale: null, kind: 'name', term: 'x', compact: 'x' },
    ])
    // A synonyms value that is not an array (bad user data) is ignored rather than thrown on.
    const odd = searchTermsForIngredient({
      name: 'Y',
      synonyms: { de: 'not-a-list' as unknown as string[] },
    })
    expect(odd).toEqual([{ locale: null, kind: 'name', term: 'y', compact: 'y' }])
  })
})
