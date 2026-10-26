import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseMap, isDishGroup } from '~~/scripts/lib/bls.mjs'

/**
 * Invariants over the committed BLS seed files. The seed is generated, but the decision
 * file and the translations are hand-reviewed inputs that a later edit can break quietly —
 * a pair pointing at a Swiss food that no longer exists, two BLS codes claiming the same
 * Swiss food, a translation that fell out. The importer refuses a broken seed at generation
 * time; this is the same check at review time, seconds after the edit.
 */
const SEEDS = resolve(process.cwd(), 'server/database/seeds')
const read = (name: string) => readFileSync(resolve(SEEDS, name), 'utf8')
const jsonl = <T>(name: string): T[] =>
  read(name)
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T)

interface SwissFood {
  id: string
  names: Record<string, string>
}
interface BlsFood {
  code: string
  names: Record<string, string>
  category: string
  same: { dataset: string; externalId: string } | { curated: string } | null
  nutrition: { energyKcal: number | null; micros: Record<string, number> } | null
}

describe('bls-map.csv', () => {
  const map = parseMap(read('bls-map.csv'))
  const swissIds = new Set(jsonl<SwissFood>('swiss-foods.jsonl').map((s) => s.id))

  it('pairs each Swiss food with at most one BLS code, and only with foods that exist', () => {
    const seen = new Map<string, string>()
    for (const [code, row] of map) {
      if (row.decision !== 'same' || !row.target?.startsWith('swiss:')) continue
      const id = row.target.slice('swiss:'.length)
      expect(swissIds.has(id), `${code} → swiss ${id}: no such Swiss food`).toBe(true)
      expect(seen.has(id), `swiss ${id} paired with both ${seen.get(id)} and ${code}`).toBe(false)
      seen.set(id, code)
    }
    expect(seen.size).toBeGreaterThan(300)
  })

  it('lists dish-group codes only to pull components in, never to repeat the default', () => {
    for (const [code, row] of map) {
      if (isDishGroup(code)) expect(row.decision, `${code} is a dish-group code listed as skip`).not.toBe('skip')
    }
  })
})

describe('bls-foods.jsonl', () => {
  const foods = jsonl<BlsFood>('bls-foods.jsonl')
  const swissIds = new Set(jsonl<SwissFood>('swiss-foods.jsonl').map((s) => s.id))

  it('has one row per code, each with DE and EN names and a category', () => {
    const codes = new Set(foods.map((f) => f.code))
    expect(codes.size).toBe(foods.length)
    for (const f of foods) {
      expect(f.names.de, f.code).toBeTruthy()
      expect(f.names.en, f.code).toBeTruthy()
      expect(f.category, f.code).toBeTruthy()
    }
  })

  it('carries FR and IT names for every food that becomes its own ingredient', () => {
    const missing = foods.filter((f) => !f.same && !(f.names.fr && f.names.it)).map((f) => f.code)
    expect(missing).toEqual([])
  })

  it('points every pair at an existing Swiss food', () => {
    for (const f of foods) {
      if (f.same && 'dataset' in f.same) expect(swissIds.has(f.same.externalId), f.code).toBe(true)
    }
  })

  it('applies the published errata', () => {
    const byCode = new Map(foods.map((f) => [f.code, f]))
    // §6: no usable nutrition for Sardelle roh until 4.1.
    expect(byCode.get('T104100')?.nutrition).toBeNull()
    // §2: Mandel süß calcium.
    expect(byCode.get('H210100')?.nutrition?.micros.calcium_mg).toBe(254)
    // §1.2: Magermilch retinol.
    expect(byCode.get('M111100')?.nutrition?.micros.retinol_mcg).toBe(2.4)
  })

  it('keeps missing values missing: no food claims an energy value of null with a nutrition row of zeros', () => {
    for (const f of foods) {
      if (f.nutrition) expect(f.nutrition.energyKcal, `${f.code} has a nutrition row without energy`).not.toBeNull()
    }
  })
})
