import {
  VITAMIN_KEYS,
  MINERAL_KEYS,
  MICRO_KEYS,
  MICRO_LABELS,
  unitFromMicroKey,
  type MicroKey,
} from '~~/shared/utils/ingredientMicros'

/**
 * The macro fields `server/utils/nutrition.ts` reads, shared between `NewIngredientModal`
 * and `EditIngredientModal` — they used to keep separate copies that had to be edited in
 * lockstep. Ordered the way a EU nutrition label reads: energy, fat (of which saturates),
 * carbohydrate (of which sugars), fibre, protein, salt.
 */
export const MACRO_FIELDS = [
  { key: 'energyKcal100g', label: 'kcal', unit: '' },
  { key: 'fat100g', labelKey: 'nutrition.fat', unit: 'g' },
  { key: 'saturatedFat100g', labelKey: 'nutrition.saturatedFat', unit: 'g' },
  { key: 'carbs100g', labelKey: 'nutrition.carbs', unit: 'g' },
  { key: 'sugars100g', labelKey: 'nutrition.sugars', unit: 'g' },
  { key: 'fiber100g', labelKey: 'nutrition.fiber', unit: 'g' },
  { key: 'protein100g', labelKey: 'nutrition.protein', unit: 'g' },
  { key: 'salt100g', labelKey: 'nutrition.salt', unit: 'g' },
] as const
export type MacroKey = (typeof MACRO_FIELDS)[number]['key']

export function emptyMicros(): Record<MicroKey, string> {
  return Object.fromEntries(MICRO_KEYS.map((key) => [key, ''])) as Record<MicroKey, string>
}

/**
 * Drop empty-string entries before sending: an object with every value `''` should read as
 * "nothing provided", not as real data the API would store.
 */
export function droppedEmpty<T extends Record<string, string>>(record: T): Partial<T> {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v.trim() !== '')) as Partial<T>
}

export function useIngredientNutrientFields() {
  const { t } = useI18n()

  function labelFor(field: (typeof MACRO_FIELDS)[number]): string {
    return 'labelKey' in field ? t(field.labelKey) : field.label
  }

  return { MACRO_FIELDS, labelFor, VITAMIN_KEYS, MINERAL_KEYS, MICRO_LABELS, unitFromMicroKey }
}
