import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Static checks over the generated migration SQL.
 *
 * ## Why this exists
 *
 * Drizzle names a foreign key `{table}_{column}_{refTable}_{refColumn}_fk`. With two long
 * table names that overflows **MySQL's 64-character identifier limit**, and the way it fails
 * is the worst possible shape:
 *
 * - `CREATE TABLE` succeeds, so the tables are there.
 * - The following `ALTER TABLE … ADD CONSTRAINT` dies with `ER_TOO_LONG_IDENT`.
 * - `drizzle-kit migrate` prints a spinner, swallows the error and exits non-zero with no
 *   message at all.
 *
 * So a `SHOW TABLES` says everything worked, the app runs locally because the tables exist,
 * and the only place it surfaces is CI's migrate step — as a bare "exit code 1". That is
 * exactly what happened with `recipe_discussion_comments_discussion_id_recipe_discussions_id_fk`
 * (65 characters), and checking "do the tables exist" instead of "did migrate succeed" is
 * what let it through.
 *
 * The fix is an explicit `name:` on the `foreignKey()` in the schema. This test is what
 * makes the next one impossible to miss: it fails in the unit suite, seconds after
 * `db:generate`, instead of in a workflow twenty minutes later.
 */

const MIGRATIONS_DIR = resolve(process.cwd(), 'server/database/migrations')
/** MySQL's hard limit for table, column, index and constraint names. */
const MAX_IDENTIFIER = 64

function migrationFiles(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8') }))
}

describe('migration SQL', () => {
  it('has migrations to check', () => {
    expect(migrationFiles().length).toBeGreaterThan(0)
  })

  it('never emits an identifier MySQL will refuse', () => {
    const offenders: string[] = []

    for (const { name, sql } of migrationFiles()) {
      // Every backtick-quoted name in the file. Column names are in there too, which is
      // correct — the 64-character limit applies to all of them.
      for (const [, identifier] of sql.matchAll(/`([^`]+)`/g)) {
        if (identifier!.length > MAX_IDENTIFIER) {
          offenders.push(`${name}: ${identifier!.length} chars — ${identifier}`)
        }
      }
    }

    expect(
      offenders,
      `MySQL refuses identifiers over ${MAX_IDENTIFIER} characters with ER_TOO_LONG_IDENT, and ` +
        'drizzle-kit reports it as a bare non-zero exit. Give the constraint an explicit ' +
        '`name:` in the schema (see `recipeDiscussionComments`), then regenerate.\n' +
        offenders.join('\n')
    ).toEqual([])
  })

  /**
   * The journal is what `drizzle-kit migrate` reads to decide what to apply. It was
   * gitignored once, which meant a fresh checkout applied *nothing* and failed silently —
   * see the note in `.claude/current_state.md` §13. A gap or a duplicate in the sequence
   * would be a subtler version of the same class of problem.
   */
  it('has a journal whose entries match the files, in an unbroken sequence', () => {
    const journal = JSON.parse(readFileSync(resolve(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8')) as {
      entries: { idx: number; tag: string }[]
    }

    const files = new Set(migrationFiles().map((f) => f.name.replace(/\.sql$/, '')))
    for (const entry of journal.entries) {
      expect(files.has(entry.tag), `journal references ${entry.tag}.sql, which does not exist`).toBe(true)
    }
    expect(journal.entries.length, 'a .sql file exists that the journal does not list').toBe(files.size)

    const indices = journal.entries.map((e) => e.idx)
    expect(indices, 'the journal is out of order or has gaps').toEqual(indices.map((_, i) => i))
  })
})
