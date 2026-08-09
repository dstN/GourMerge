import { describe, it, expect } from 'vitest'
import { escapeLikePattern } from '~~/server/utils/likeEscape'

describe('escapeLikePattern', () => {
  it('escapes % and _ so they match themselves literally', () => {
    expect(escapeLikePattern('50%')).toBe('50\\%')
    expect(escapeLikePattern('a_b')).toBe('a\\_b')
    expect(escapeLikePattern('%%%%%')).toBe('\\%\\%\\%\\%\\%')
  })

  it('escapes a literal backslash first, so it cannot un-escape a wildcard that follows it', () => {
    // Without escaping the backslash itself, `\%` in the input would read as an
    // already-escaped literal `%` to MySQL instead of a backslash followed by a wildcard.
    expect(escapeLikePattern('a\\%')).toBe('a\\\\\\%')
  })

  it('leaves ordinary text untouched', () => {
    expect(escapeLikePattern('Tomate')).toBe('Tomate')
    expect(escapeLikePattern('')).toBe('')
  })
})
