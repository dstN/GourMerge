/**
 * Micronutrient catalog — the vitamin/mineral keys the Swiss BLV import writes into
 * `ingredient_nutrition.micros` (see `scripts/import-swiss-foods.mjs`), also the exact set a
 * user can self-report for their own ingredients. Shared between server validation and both
 * the input forms and `NutritionFacts.vue`'s display so a key can never drift between "what
 * we accept" and "what we show".
 */
export const VITAMIN_KEYS = [
  'vit_a_re_mcg',
  'retinol_mcg',
  'beta_carotene_mcg',
  'vit_b1_mg',
  'vit_b2_mg',
  'vit_b6_mg',
  'vit_b12_mcg',
  'niacin_mg',
  'folate_mcg',
  'pantothenic_mg',
  'vit_c_mg',
  'vit_d_mcg',
  'vit_e_mg',
] as const

export const MINERAL_KEYS = [
  'potassium_mg',
  'sodium_mg',
  'chloride_mg',
  'calcium_mg',
  'magnesium_mg',
  'phosphorus_mg',
  'iron_mg',
  'iodine_mcg',
  'zinc_mg',
  'selenium_mcg',
] as const

export const MICRO_KEYS = [...VITAMIN_KEYS, ...MINERAL_KEYS] as const
export type MicroKey = (typeof MICRO_KEYS)[number]

export const MICRO_LABELS: Record<MicroKey, string> = {
  vit_a_re_mcg: 'Vit. A',
  retinol_mcg: 'Retinol',
  beta_carotene_mcg: 'Beta-Carotin',
  vit_b1_mg: 'Vit. B1',
  vit_b2_mg: 'Vit. B2',
  vit_b6_mg: 'Vit. B6',
  vit_b12_mcg: 'Vit. B12',
  niacin_mg: 'Niacin',
  folate_mcg: 'Folat',
  pantothenic_mg: 'Vit. B5',
  vit_c_mg: 'Vit. C',
  vit_d_mcg: 'Vit. D',
  vit_e_mg: 'Vit. E',
  potassium_mg: 'Kalium',
  sodium_mg: 'Natrium',
  chloride_mg: 'Chlorid',
  calcium_mg: 'Calcium',
  magnesium_mg: 'Magnesium',
  phosphorus_mg: 'Phosphor',
  iron_mg: 'Eisen',
  iodine_mcg: 'Jod',
  zinc_mg: 'Zink',
  selenium_mcg: 'Selen',
}

export function unitFromMicroKey(key: string): string {
  if (key.endsWith('_re_mcg')) return 'µg RE'
  if (key.endsWith('_mcg')) return 'µg'
  return 'mg'
}
