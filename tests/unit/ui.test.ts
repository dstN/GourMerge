import { describe, test, expect } from 'vitest'
import { GMR_STATUS_COLOR, DIFFICULTY_COLOR, TINT_CLASS, CARD_GRID, navLinkClass } from '../../app/utils/ui'

/**
 * These maps exist so a state→colour decision is made once (DESIGNBOOK §7). They
 * were previously duplicated — the GourMerge Request status map lived in both the
 * list page and the detail page, difficulty colour was re-derived in three places.
 *
 * What is worth testing is not the individual values but the *completeness*
 * invariants: every state the schema allows must resolve to a colour, and every
 * colour used for a tinted badge must have a matching light/dark text class. Those
 * are exactly what silently breaks when someone adds a status.
 */

/** Mirrors the `gourmerge_requests.status` enum in server/database/schema.ts. */
const GMR_STATUSES = ['draft', 'open', 'closed', 'merged'] as const

/** Mirrors the `recipes.difficulty` enum. */
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const

describe('GMR_STATUS_COLOR', () => {
  test('covers every status in the schema enum', () => {
    for (const status of GMR_STATUSES) {
      expect(GMR_STATUS_COLOR[status], `no colour for status "${status}"`).toBeTruthy()
    }
  })

  test('maps each status to a distinct colour so states are visually separable', () => {
    const colours = GMR_STATUSES.map((s) => GMR_STATUS_COLOR[s])
    expect(new Set(colours).size).toBe(GMR_STATUSES.length)
  })

  test('an unknown status resolves to undefined rather than a wrong colour', () => {
    // Call sites fall back to 'neutral'; silently reusing another state's colour
    // would be worse than showing a neutral badge.
    expect(GMR_STATUS_COLOR['nonsense']).toBeUndefined()
  })
})

describe('DIFFICULTY_COLOR', () => {
  test('covers every difficulty in the schema enum', () => {
    for (const d of DIFFICULTIES) {
      expect(DIFFICULTY_COLOR[d], `no colour for difficulty "${d}"`).toBeTruthy()
    }
  })

  test('runs easy → hard as success → warning → error', () => {
    expect(DIFFICULTY_COLOR.easy).toBe('success')
    expect(DIFFICULTY_COLOR.medium).toBe('warning')
    expect(DIFFICULTY_COLOR.hard).toBe('error')
  })
})

describe('TINT_CLASS', () => {
  test('every colour either has a tint class or is explicitly opted out', () => {
    // An undefined lookup would render `class="undefined"`; an empty string is the
    // deliberate "this colour needs no contrast correction" signal.
    for (const colour of [...Object.values(GMR_STATUS_COLOR), ...Object.values(DIFFICULTY_COLOR)]) {
      expect(TINT_CLASS[colour], `no TINT_CLASS entry for "${colour}"`).toBeDefined()
    }
  })

  test('tint classes match the `.tint-*` names defined in main.css', () => {
    expect(TINT_CLASS.success).toBe('tint-success')
    expect(TINT_CLASS.warning).toBe('tint-warning')
    expect(TINT_CLASS.error).toBe('tint-error')
    expect(TINT_CLASS.info).toBe('tint-info')
  })

  test('primary and neutral opt out — the palette already handles them', () => {
    expect(TINT_CLASS.primary).toBe('')
    expect(TINT_CLASS.neutral).toBe('')
  })
})

describe('navLinkClass', () => {
  test('active and idle differ, so the current page is identifiable', () => {
    expect(navLinkClass(true).join(' ')).not.toBe(navLinkClass(false).join(' '))
  })

  test('active uses the brand tint; idle is muted with a hover affordance', () => {
    expect(navLinkClass(true).join(' ')).toContain('text-primary-500')
    const idle = navLinkClass(false).join(' ')
    expect(idle).toContain('text-muted')
    expect(idle).toContain('hover:')
  })

  test('shared structural classes are identical in both states', () => {
    // Only the colour block may vary — otherwise the active item would shift
    // position or size relative to its neighbours.
    const [activeBase] = navLinkClass(true)
    const [idleBase] = navLinkClass(false)
    expect(activeBase).toBe(idleBase)
  })
})

describe('CARD_GRID', () => {
  test('is the single responsive card grid (1 → 2 → 3 columns)', () => {
    expect(CARD_GRID).toContain('grid')
    expect(CARD_GRID).toContain('sm:grid-cols-2')
    expect(CARD_GRID).toContain('lg:grid-cols-3')
  })

  test('carries a gap, so no call site has to add spacing', () => {
    expect(CARD_GRID).toMatch(/\bgap-\d/)
  })
})
