/**
 * Escape `%` and `_` (LIKE's own wildcards) and `\` (LIKE's default escape character) in a
 * string that is about to become part of a `LIKE` pattern.
 *
 * Not SQL injection — Drizzle parameterises every value here, so the database never sees
 * anything except a placeholder. What an unescaped `%`/`_` buys an attacker is cheaper:
 * `q=%%%%%` (or any string that is mostly wildcards) forces a near-full table scan on every
 * request, for the cost of typing five characters. Escaping the two wildcard characters (and
 * the backslash that would otherwise escape *them*) makes user input match itself literally,
 * the way a search box is supposed to behave anyway — "50%" should find "50%", not everything.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}
