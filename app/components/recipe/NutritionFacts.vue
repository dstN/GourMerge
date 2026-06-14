<script setup lang="ts">
import type { NutritionTotals } from '~~/shared/types/recipe'

const { t } = useI18n()

const props = defineProps<{
  total: NutritionTotals
  perServing: NutritionTotals
  servings: number
}>()

const activeTab = ref<'serving' | 'total'>('serving')
const showMicros = ref(false)

const current = computed(() => activeTab.value === 'serving' ? props.perServing : props.total)

function fmt(n: number | null | undefined, decimals = 1) {
  if (n === null || n === undefined) return '–'
  return n.toFixed(decimals)
}

const macros = computed(() => [
  { key: 'protein',     label: t('nutrition.protein'),     value: current.value.protein,     unit: 'g',   color: 'bg-blue-500' },
  { key: 'carbs',       label: t('nutrition.carbs'),       value: current.value.carbs,       unit: 'g',   color: 'bg-amber-500' },
  { key: 'fat',         label: t('nutrition.fat'),         value: current.value.fat,         unit: 'g',   color: 'bg-orange-500' },
  { key: 'fiber',       label: t('nutrition.fiber'),       value: current.value.fiber,       unit: 'g',   color: 'bg-green-500' },
  { key: 'saturatedFat',label: t('nutrition.saturatedFat'),value: current.value.saturatedFat,unit: 'g',   color: 'bg-red-400' },
])

// Macro energy ratio bars (protein 4 kcal/g, carbs 4 kcal/g, fat 9 kcal/g)
const macroKcal = computed(() => {
  const p = current.value.protein * 4
  const c = current.value.carbs * 4
  const f = current.value.fat * 9
  const total = p + c + f || 1
  return { protein: (p / total) * 100, carbs: (c / total) * 100, fat: (f / total) * 100 }
})

const VITAMIN_KEYS = ['vit_a_re_mcg', 'retinol_mcg', 'vit_b1_mg', 'vit_b2_mg', 'vit_b6_mg', 'vit_b12_mcg', 'niacin_mg', 'folate_mcg', 'pantothenic_mg', 'vit_c_mg', 'vit_d_mcg', 'vit_e_mg']
const MINERAL_KEYS = ['potassium_mg', 'sodium_mg', 'chloride_mg', 'calcium_mg', 'magnesium_mg', 'phosphorus_mg', 'iron_mg', 'iodine_mcg', 'zinc_mg', 'selenium_mcg']

const MICRO_LABELS: Record<string, string> = {
  vit_a_re_mcg:   'Vit. A',
  retinol_mcg:    'Retinol',
  vit_b1_mg:      'Vit. B1',
  vit_b2_mg:      'Vit. B2',
  vit_b6_mg:      'Vit. B6',
  vit_b12_mcg:    'Vit. B12',
  niacin_mg:      'Niacin',
  folate_mcg:     'Folat',
  pantothenic_mg: 'Vit. B5',
  vit_c_mg:       'Vit. C',
  vit_d_mcg:      'Vit. D',
  vit_e_mg:       'Vit. E',
  potassium_mg:   'Kalium',
  sodium_mg:      'Natrium',
  chloride_mg:    'Chlorid',
  calcium_mg:     'Calcium',
  magnesium_mg:   'Magnesium',
  phosphorus_mg:  'Phosphor',
  iron_mg:        'Eisen',
  iodine_mcg:     'Jod',
  zinc_mg:        'Zink',
  selenium_mcg:   'Selen',
}

function unitFromKey(key: string): string {
  if (key.endsWith('_re_mcg')) return 'µg RE'
  if (key.endsWith('_mcg')) return 'µg'
  return 'mg'
}

function microItems(keys: string[]) {
  const m = current.value.micros
  if (!m) return []
  return keys
    .filter(k => m[k] !== undefined && m[k] > 0)
    .map(k => ({ key: k, label: MICRO_LABELS[k] ?? k, value: m[k], unit: unitFromKey(k) }))
}

const vitamins = computed(() => microItems(VITAMIN_KEYS))
const minerals = computed(() => microItems(MINERAL_KEYS))
const hasMicros = computed(() => vitamins.value.length > 0 || minerals.value.length > 0)
</script>

<template>
  <UCard class="mb-6">
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-flame" class="size-5 text-primary-500" />
          <h2 class="text-lg font-semibold">{{ t('nutrition.title') }}</h2>
          <UBadge
            v-if="total.isApproximate"
            color="warning"
            variant="subtle"
            icon="i-lucide-info"
            :label="t('nutrition.approximate')"
            size="xs"
          />
        </div>

        <!-- Per-serving / Total toggle -->
        <div class="flex rounded-lg overflow-hidden border border-[var(--ui-border)] text-sm">
          <button
            :class="['px-3 py-1 transition-colors', activeTab === 'serving' ? 'bg-primary-500 text-white' : 'hover:bg-[var(--ui-bg-elevated)]']"
            @click="activeTab = 'serving'"
          >
            {{ t('nutrition.perServing') }}
          </button>
          <button
            :class="['px-3 py-1 transition-colors', activeTab === 'total' ? 'bg-primary-500 text-white' : 'hover:bg-[var(--ui-bg-elevated)]']"
            @click="activeTab = 'total'"
          >
            {{ t('nutrition.total') }}
          </button>
        </div>
      </div>
    </template>

    <!-- Energy highlight -->
    <div class="flex items-baseline gap-2 mb-4">
      <span class="text-4xl font-bold text-primary-500">{{ fmt(current.kcal, 0) }}</span>
      <span class="text-[var(--ui-text-muted)]">kcal</span>
      <span class="text-sm text-[var(--ui-text-dimmed)] ml-auto">
        {{
          activeTab === 'serving'
            ? t('nutrition.perServingLabel', { n: servings })
            : t('nutrition.totalLabel', { n: servings })
        }}
      </span>
    </div>

    <!-- Macro ratio bar -->
    <div class="flex h-2 rounded-full overflow-hidden mb-6 bg-[var(--ui-bg-elevated)]">
      <div class="bg-blue-500 transition-all" :style="{ width: macroKcal.protein + '%' }" />
      <div class="bg-amber-500 transition-all" :style="{ width: macroKcal.carbs + '%' }" />
      <div class="bg-orange-500 transition-all" :style="{ width: macroKcal.fat + '%' }" />
    </div>

    <!-- Macros grid -->
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div
        v-for="m in macros"
        :key="m.key"
        class="rounded-lg bg-[var(--ui-bg-elevated)] px-3 py-2"
      >
        <div class="flex items-center gap-1.5 mb-0.5">
          <span class="inline-block size-2 rounded-full" :class="m.color" />
          <span class="text-xs text-[var(--ui-text-muted)]">{{ m.label }}</span>
        </div>
        <span class="font-semibold">{{ fmt(m.value) }}</span>
        <span class="text-xs text-[var(--ui-text-dimmed)]"> {{ m.unit }}</span>
      </div>
    </div>

    <!-- Micronutrients (collapsible) -->
    <template v-if="hasMicros">
      <div class="mt-4 border-t border-[var(--ui-border)] pt-4">
        <button
          class="flex items-center gap-1.5 text-sm text-primary-500 hover:text-primary-400 transition-colors"
          @click="showMicros = !showMicros"
        >
          <UIcon :name="showMicros ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4" />
          {{ t('nutrition.showMicros') }}
        </button>

        <template v-if="showMicros">
          <!-- Vitamins -->
          <div v-if="vitamins.length > 0" class="mt-3">
            <p class="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-dimmed)] mb-2">
              {{ t('nutrition.vitamins') }}
            </p>
            <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
              <div
                v-for="m in vitamins"
                :key="m.key"
                class="rounded bg-[var(--ui-bg-elevated)] px-2 py-1.5"
              >
                <div class="text-xs text-[var(--ui-text-muted)] truncate">{{ m.label }}</div>
                <div class="text-sm font-medium leading-tight">
                  {{ fmt(m.value, m.unit === 'mg' ? 1 : 2) }}
                  <span class="text-xs text-[var(--ui-text-dimmed)]">{{ m.unit }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Minerals -->
          <div v-if="minerals.length > 0" class="mt-3">
            <p class="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-dimmed)] mb-2">
              {{ t('nutrition.minerals') }}
            </p>
            <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
              <div
                v-for="m in minerals"
                :key="m.key"
                class="rounded bg-[var(--ui-bg-elevated)] px-2 py-1.5"
              >
                <div class="text-xs text-[var(--ui-text-muted)] truncate">{{ m.label }}</div>
                <div class="text-sm font-medium leading-tight">
                  {{ fmt(m.value, m.unit === 'mg' ? 1 : 2) }}
                  <span class="text-xs text-[var(--ui-text-dimmed)]">{{ m.unit }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </template>

    <!-- Coverage disclaimer -->
    <p
      v-if="total.missingCount > 0"
      class="mt-4 text-xs text-[var(--ui-text-dimmed)] flex items-center gap-1"
    >
      <UIcon name="i-lucide-info" class="size-3.5 shrink-0" />
      {{ t('nutrition.missingCount', { n: total.missingCount }) }}
    </p>
  </UCard>
</template>
