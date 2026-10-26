import { describe, it, expect } from 'vitest'
import {
  categoryForCode,
  correctEnergy,
  decisionFor,
  isDishGroup,
  mapNutrition,
  parseMap,
  parseValue,
} from '~~/scripts/lib/bls.mjs'

describe('parseValue', () => {
  it('reads numbers and decimal commas', () => {
    expect(parseValue(12.5)).toBe(12.5)
    expect(parseValue('12,5')).toBe(12.5)
    expect(parseValue('0')).toBe(0)
  })

  it('keeps a missing value missing — "-" and an empty cell are NULL, never zero', () => {
    expect(parseValue('-')).toBeNull()
    expect(parseValue('')).toBeNull()
    expect(parseValue(null)).toBeNull()
    expect(parseValue(undefined)).toBeNull()
  })

  it('treats traces and below-limit markers as zero', () => {
    expect(parseValue('TR')).toBe(0)
    expect(parseValue('<LOQ')).toBe(0)
    expect(parseValue('<LOD')).toBe(0)
  })
})

describe('correctEnergy (erratum §3, OLSAC counted twice)', () => {
  it('removes the 2 kcal/g and 8 kJ/g the MRI software added on top of CHO', () => {
    // Glucose syrup, 47.7 g OLSAC: the published 23 % overestimate.
    expect(correctEnergy(339, 1440, 47.7)).toEqual({ kcal: 243.6, kj: 1058.4 })
  })

  it('leaves foods without oligosaccharides alone', () => {
    expect(correctEnergy(343, 1443, 0)).toEqual({ kcal: 343, kj: 1443 })
    expect(correctEnergy(343, 1443, null)).toEqual({ kcal: 343, kj: 1443 })
  })
})

describe('mapNutrition', () => {
  const values = {
    ENERCC: 343,
    ENERCJ: 1443,
    OLSAC: 0,
    FAT: 7.1,
    FASAT: 1.25,
    CHO: 58.7,
    SUGAR: 1.1,
    STARCH: 57.6,
    FIBT: 9.7,
    PROT625: 13.1,
    NACL: 0.01,
    ALC: 0,
    WATER: 10.3,
    VITB6: 960, // µg in the BLS
    VITA: '-',
    ZN: '',
    FE: '<LOQ',
    CA: 54,
  }

  it('maps the macro columns and converts vitamin B6 from µg to mg', () => {
    const n = mapNutrition(values, undefined)!
    expect(n.energyKcal).toBe(343)
    expect(n.protein).toBe(13.1)
    expect(n.fiber).toBe(9.7)
    expect(n.micros.vit_b6_mg).toBe(0.96)
    expect(n.micros.calcium_mg).toBe(54)
  })

  it('drops missing micros instead of writing zeros, but keeps below-limit values as zero', () => {
    const n = mapNutrition(values, undefined)!
    expect('vit_a_re_mcg' in n.micros).toBe(false)
    expect('zinc_mg' in n.micros).toBe(false)
    expect(n.micros.iron_mg).toBe(0)
    expect('selenium_mcg' in n.micros).toBe(false)
  })

  it('applies an erratum override on top of the spreadsheet value', () => {
    const n = mapNutrition(values, { micros: { calcium_mg: 254 } })!
    expect(n.micros.calcium_mg).toBe(254)
  })

  it('returns no nutrition at all when the erratum says the values are unusable', () => {
    expect(mapNutrition(values, { nutrition: null })).toBeNull()
  })
})

describe('scope and categories', () => {
  it('knows the dish groups', () => {
    expect(isDishGroup('X411243')).toBe(true)
    expect(isDishGroup('Y872460')).toBe(true)
    expect(isDishGroup('C214100')).toBe(false)
  })

  it('maps main groups to the catalog categories, with the sub-group splits', () => {
    expect(categoryForCode('C214100')).toBe('grain')
    expect(categoryForCode('E111100')).toBe('egg')
    expect(categoryForCode('E410000')).toBe('grain')
    expect(categoryForCode('H120100')).toBe('nut')
    expect(categoryForCode('H710100')).toBe('legume')
    expect(categoryForCode('K701100')).toBe('vegetable')
    expect(categoryForCode('K111100')).toBe('grain')
    expect(categoryForCode('Q911000')).toBe('condiment')
    expect(categoryForCode('Q111000')).toBe('oil')
    expect(categoryForCode('R421100')).toBe('baking')
    expect(categoryForCode('X3A9010')).toBe('condiment')
    expect(categoryForCode('U010100')).toBe('meat')
  })
})

describe('bls-map.csv', () => {
  const csv = [
    'bls_code,decision,target,note',
    'G561100,same,swiss:348,',
    'X411243,new,,component: stock',
    'T104100,skip,,',
  ].join('\n')

  it('parses rows and applies the defaults for unlisted codes', () => {
    const map = parseMap(csv)
    expect(decisionFor('G561100', map)).toEqual({ decision: 'same', target: 'swiss:348', note: null })
    expect(decisionFor('X411243', map).decision).toBe('new')
    expect(decisionFor('T104100', map).decision).toBe('skip')
    // Unlisted: a food group is imported, a dish group is not.
    expect(decisionFor('C214100', map).decision).toBe('new')
    expect(decisionFor('Y872460', map).decision).toBe('skip')
  })

  it('refuses a same row without a target, an unknown decision, and a duplicate code', () => {
    expect(() => parseMap('bls_code,decision,target,note\nG561100,same,,')).toThrow(/needs a swiss/)
    expect(() => parseMap('bls_code,decision,target,note\nG561100,merge,,')).toThrow(/bad row/)
    expect(() => parseMap('bls_code,decision,target,note\nG561100,skip,,\nG561100,skip,,')).toThrow(/twice/)
    expect(() => parseMap('code,decision\nG561100,skip')).toThrow(/header/)
  })
})
