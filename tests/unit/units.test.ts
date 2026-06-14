import { describe, it, expect } from 'vitest'
import { toMetric, fromMetric, getBestDisplayUnit, formatQuantityUnit } from '../../server/utils/units'

describe('toMetric', () => {
  it('returns g/ml passthrough unchanged', () => {
    expect(toMetric(500, 'g')).toEqual({ quantity: 500, unit: 'g' })
    expect(toMetric(250, 'ml')).toEqual({ quantity: 250, unit: 'ml' })
  })

  it('passes piece and pinch through unchanged', () => {
    expect(toMetric(3, 'piece')).toEqual({ quantity: 3, unit: 'piece' })
    expect(toMetric(1, 'pinch')).toEqual({ quantity: 1, unit: 'pinch' })
  })

  it('passes tsp and tbsp through as canonical', () => {
    expect(toMetric(2, 'tsp')).toEqual({ quantity: 2, unit: 'tsp' })
    expect(toMetric(1, 'tbsp')).toEqual({ quantity: 1, unit: 'tbsp' })
  })

  it('converts kg → g', () => {
    const result = toMetric(1, 'kg')
    expect(result.unit).toBe('g')
    expect(result.quantity).toBeCloseTo(1000, 1)
  })

  it('converts lb → g', () => {
    const result = toMetric(1, 'lb')
    expect(result.unit).toBe('g')
    expect(result.quantity).toBeCloseTo(453.59, 1)
  })

  it('converts cup → ml', () => {
    const result = toMetric(2, 'cup')
    expect(result.unit).toBe('ml')
    expect(result.quantity).toBeCloseTo(473.18, 1)
  })

  it('converts l → ml', () => {
    const result = toMetric(1, 'l')
    expect(result.unit).toBe('ml')
    expect(result.quantity).toBeCloseTo(1000, 1)
  })

  it('throws on unknown unit', () => {
    expect(() => toMetric(1, 'unknown' as any)).toThrow('Unknown unit')
  })
})

describe('fromMetric', () => {
  it('returns same unit passthrough when equal', () => {
    expect(fromMetric(500, 'g', 'g')).toEqual({ quantity: 500, unit: 'g' })
  })

  it('converts g → kg', () => {
    const result = fromMetric(1000, 'g', 'kg')
    expect(result.unit).toBe('kg')
    expect(result.quantity).toBeCloseTo(1, 2)
  })

  it('converts ml → cup', () => {
    const result = fromMetric(236.588, 'ml', 'cup')
    expect(result.unit).toBe('cup')
    expect(result.quantity).toBeCloseTo(1, 1)
  })

  it('falls back to original unit when conversion is incompatible (g → cup)', () => {
    const result = fromMetric(500, 'g', 'cup')
    expect(result.unit).toBe('g')
    expect(result.quantity).toBe(500)
  })
})

describe('getBestDisplayUnit', () => {
  it('returns piece/pinch as-is', () => {
    expect(getBestDisplayUnit(3, 'piece', 'metric')).toEqual({ quantity: 3, unit: 'piece' })
    expect(getBestDisplayUnit(1, 'pinch', 'metric')).toEqual({ quantity: 1, unit: 'pinch' })
  })

  it('upgrades g → kg at ≥1000g (metric)', () => {
    const result = getBestDisplayUnit(1500, 'g', 'metric')
    expect(result.unit).toBe('kg')
    expect(result.quantity).toBeCloseTo(1.5, 1)
  })

  it('keeps g as-is when <1000g (metric)', () => {
    const result = getBestDisplayUnit(500, 'g', 'metric')
    expect(result.unit).toBe('g')
    expect(result.quantity).toBe(500)
  })

  it('upgrades ml → l at ≥1000ml (metric)', () => {
    const result = getBestDisplayUnit(2000, 'ml', 'metric')
    expect(result.unit).toBe('l')
    expect(result.quantity).toBeCloseTo(2, 1)
  })

  it('uses oz for small masses and lb for large in imperial', () => {
    // < 453.592g threshold → oz
    const light = getBestDisplayUnit(200, 'g', 'imperial')
    expect(light.unit).toBe('oz')

    // ≥ 453.592g threshold → lb
    const heavy = getBestDisplayUnit(500, 'g', 'imperial')
    expect(heavy.unit).toBe('lb')
  })

  it('uses cup for large volumes in imperial', () => {
    const result = getBestDisplayUnit(500, 'ml', 'imperial')
    expect(result.unit).toBe('cup')
  })
})

describe('formatQuantityUnit', () => {
  it('formats with English locale', () => {
    expect(formatQuantityUnit(250, 'g', 'en')).toBe('250 g')
    expect(formatQuantityUnit(1.5, 'kg', 'en')).toBe('1.5 kg')
  })

  it('formats with German locale (decimal comma)', () => {
    const result = formatQuantityUnit(1.5, 'kg', 'de')
    expect(result).toBe('1,5 kg')
  })
})
