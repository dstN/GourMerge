import { describe, test, expect } from 'vitest'
import { generateSlug } from '../../server/utils/slug'

describe('generateSlug', () => {
  test('lowercases and hyphenates words', () => {
    expect(generateSlug('Omas Apfelkuchen')).toBe('omas-apfelkuchen')
  })

  test('transliterates German umlauts and ß', () => {
    expect(generateSlug('Käse Brötchen')).toBe('kaese-broetchen')
    expect(generateSlug('Süße Grüße')).toBe('suesse-gruesse')
    expect(generateSlug('Straße')).toBe('strasse')
  })

  test('transliterates accented Latin characters', () => {
    expect(generateSlug('Crème Brûlée')).toBe('creme-brulee')
    expect(generateSlug('Jalapeño')).toBe('jalapeno')
    expect(generateSlug('Façade')).toBe('facade')
  })

  test('strips emoji', () => {
    expect(generateSlug('Apfelkuchen 🍎🥧')).toBe('apfelkuchen')
  })

  test('strips punctuation and symbols', () => {
    expect(generateSlug('Mom’s "Best" Cake!!! (v2)')).toBe('moms-best-cake-v2')
  })

  test('collapses repeated whitespace and hyphens', () => {
    expect(generateSlug('a   b---c')).toBe('a-b-c')
  })

  test('trims leading and trailing hyphens', () => {
    expect(generateSlug('  --hello--  ')).toBe('hello')
  })

  test('falls back to "recipe" when everything is stripped', () => {
    expect(generateSlug('🍎🥧')).toBe('recipe')
    expect(generateSlug('   ')).toBe('recipe')
    expect(generateSlug('!!!')).toBe('recipe')
  })

  test('keeps digits', () => {
    expect(generateSlug('Recipe 123')).toBe('recipe-123')
  })
})
