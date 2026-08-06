import { describe, test, expect } from 'vitest'
import { buildShoppingList } from '../../app/utils/shoppingList'

describe('buildShoppingList', () => {
  const base = {
    title: 'Garlic Butter Chicken',
    subtitle: '4 Portionen',
    items: [
      { amount: '650 g', name: 'Poulet, Brust, ohne Haut, roh', notes: 'in Streifen geschnitten' },
      { amount: '2 EL', name: 'Olivenöl', notes: null },
    ],
  }

  test('renders a title, a subtitle and a dash-prefixed list', () => {
    // `- ` because Apple Notes, Google Keep and most editors turn it into a checklist on
    // paste — the reason the list is worth sending anywhere at all.
    expect(buildShoppingList(base)).toBe(
      [
        'Garlic Butter Chicken',
        '4 Portionen',
        '',
        '- 650 g Poulet, Brust, ohne Haut, roh (in Streifen geschnitten)',
        '- 2 EL Olivenöl',
      ].join('\n')
    )
  })

  test('omits the subtitle when there is none', () => {
    const out = buildShoppingList({ ...base, subtitle: null })
    expect(out.split('\n').slice(0, 2)).toEqual(['Garlic Butter Chicken', ''])
  })

  test('omits a missing amount instead of leaving a separator', () => {
    // "Salz, nach Geschmack" is a real ingredient with no quantity.
    const out = buildShoppingList({ title: 'T', items: [{ name: 'Salz', notes: 'nach Geschmack' }] })
    expect(out).toContain('- Salz (nach Geschmack)')
    expect(out).not.toContain('-  Salz')
  })

  test('returns an empty string when there is nothing to list', () => {
    // Lets a caller treat "empty" as "do not offer the action" without checking twice.
    expect(buildShoppingList({ title: 'T', items: [] })).toBe('')
    expect(buildShoppingList({ title: 'T', items: [{ name: '   ' }] })).toBe('')
  })

  test('skips nameless rows but keeps the rest', () => {
    const out = buildShoppingList({
      title: 'T',
      items: [
        { amount: '1 g', name: '' },
        { amount: '2 g', name: 'Zucker' },
      ],
    })
    expect(out).toContain('- 2 g Zucker')
    expect(out).not.toContain('1 g')
  })

  test('trims surrounding whitespace everywhere', () => {
    const out = buildShoppingList({
      title: '  T  ',
      subtitle: '  2 Portionen  ',
      items: [{ amount: ' 1 kg ', name: ' Mehl ', notes: ' gesiebt ' }],
    })
    expect(out).toBe(['T', '2 Portionen', '', '- 1 kg Mehl (gesiebt)'].join('\n'))
  })

  test('appends the source URL last, separated by a blank line', () => {
    const out = buildShoppingList({ ...base, sourceUrl: 'https://gourmerge.de/testkoch/garlic' })
    const lines = out.split('\n')
    expect(lines[lines.length - 1]).toBe('https://gourmerge.de/testkoch/garlic')
    expect(lines[lines.length - 2]).toBe('')
  })

  test('leaves the source URL out when not given', () => {
    expect(buildShoppingList(base)).not.toContain('http')
  })

  test('keeps the ingredient order it was given', () => {
    const out = buildShoppingList({
      title: 'T',
      items: [{ name: 'C' }, { name: 'A' }, { name: 'B' }],
    })
    expect(out.split('\n').filter((l) => l.startsWith('- '))).toEqual(['- C', '- A', '- B'])
  })
})
