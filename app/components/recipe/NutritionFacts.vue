<script setup lang="ts">
import type { NutritionTotals } from '~~/shared/types/recipe'

const { t } = useI18n()

const props = defineProps<{
  total: NutritionTotals
  perServing: NutritionTotals
  servings: number
  compact?: boolean
}>()

const activeTab = ref<'serving' | 'total'>('serving')
const showMicros = ref(false)

const current = computed(() => (activeTab.value === 'serving' ? props.perServing : props.total))

function fmt(n: number | null | undefined, decimals = 1) {
  if (n === null || n === undefined) return '–'
  return n.toFixed(decimals)
}

/**
 * Macro swatch colours come from the `--gm-macro-*` tokens (DESIGNBOOK §1.1) via
 * the `bg-macro-*` classes, so the legend dot and the bar segment it labels can
 * never disagree. They were previously raw `bg-amber-500` / `bg-orange-500`
 * literals duplicated between the compact and full layouts.
 */
const macros = computed(() => [
  { key: 'protein', label: t('nutrition.protein'), value: current.value.protein, unit: 'g', color: 'bg-macro-protein' },
  { key: 'carbs', label: t('nutrition.carbs'), value: current.value.carbs, unit: 'g', color: 'bg-macro-carbs' },
  { key: 'fat', label: t('nutrition.fat'), value: current.value.fat, unit: 'g', color: 'bg-macro-fat' },
  { key: 'fiber', label: t('nutrition.fiber'), value: current.value.fiber, unit: 'g', color: 'bg-success-500' },
  {
    key: 'saturatedFat',
    label: t('nutrition.saturatedFat'),
    value: current.value.saturatedFat,
    unit: 'g',
    color: 'bg-error-500',
  },
])

// Macro energy ratio bars (protein 4 kcal/g, carbs 4 kcal/g, fat 9 kcal/g)
const macroKcal = computed(() => {
  const p = current.value.protein * 4
  const c = current.value.carbs * 4
  const f = current.value.fat * 9
  const total = p + c + f || 1
  return { protein: (p / total) * 100, carbs: (c / total) * 100, fat: (f / total) * 100 }
})

const VITAMIN_KEYS = [
  'vit_a_re_mcg',
  'retinol_mcg',
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
]
const MINERAL_KEYS = [
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
]

const MICRO_LABELS: Record<string, string> = {
  vit_a_re_mcg: 'Vit. A',
  retinol_mcg: 'Retinol',
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

function unitFromKey(key: string): string {
  if (key.endsWith('_re_mcg')) return 'µg RE'
  if (key.endsWith('_mcg')) return 'µg'
  return 'mg'
}

function microItems(keys: string[]) {
  const m = current.value.micros
  if (!m) return []
  return keys
    .filter((k) => m[k] !== undefined && m[k] > 0)
    .map((k) => ({ key: k, label: MICRO_LABELS[k] ?? k, value: m[k], unit: unitFromKey(k) }))
}

const vitamins = computed(() => microItems(VITAMIN_KEYS))
const minerals = computed(() => microItems(MINERAL_KEYS))
const hasMicros = computed(() => vitamins.value.length > 0 || minerals.value.length > 0)
</script>

<template>
  <!-- sm+: single row. Below sm: stacked (energy / full-width macro bar / 2-col macros)
       to avoid the ragged flex-wrap reflow. -->
  <div v-if="compact" class="rounded-lg border border-default bg-elevated px-4 py-3 mb-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2">
      <!-- Energy -->
      <div class="flex items-center gap-1.5 shrink-0">
        <UIcon name="i-lucide-flame" class="size-4 text-primary shrink-0" aria-hidden="true" />
        <span class="text-lg font-bold leading-none">{{ fmt(perServing.kcal, 0) }}</span>
        <span class="text-xs text-muted">kcal</span>
        <span class="text-xs text-dimmed">/ {{ t('nutrition.perServing') }}</span>
      </div>

      <!-- Macro ratio bar: full width on mobile, thumbnail inline from sm up -->
      <div class="flex h-1.5 w-full overflow-hidden rounded-full bg-default sm:w-20 sm:shrink-0">
        <div class="bg-macro-protein transition-all" :style="{ width: macroKcal.protein + '%' }" />
        <div class="bg-macro-carbs transition-all" :style="{ width: macroKcal.carbs + '%' }" />
        <div class="bg-macro-fat transition-all" :style="{ width: macroKcal.fat + '%' }" />
      </div>

      <!-- Macros: 2-column grid on mobile, inline with dot separators from sm up -->
      <div
        class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:flex sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1"
      >
        <span class="flex items-center gap-1">
          <span class="inline-block size-2 rounded-full bg-macro-protein shrink-0" />
          <span class="font-medium">{{ fmt(perServing.protein, 0) }}g</span>
          <span class="text-muted">{{ t('nutrition.protein') }}</span>
        </span>
        <span class="hidden text-dimmed select-none sm:inline" aria-hidden="true">·</span>
        <span class="flex items-center gap-1">
          <span class="inline-block size-2 rounded-full bg-macro-carbs shrink-0" />
          <span class="font-medium">{{ fmt(perServing.carbs, 0) }}g</span>
          <span class="text-muted">{{ t('nutrition.carbs') }}</span>
        </span>
        <span class="hidden text-dimmed select-none sm:inline" aria-hidden="true">·</span>
        <span class="flex items-center gap-1">
          <span class="inline-block size-2 rounded-full bg-macro-fat shrink-0" />
          <span class="font-medium">{{ fmt(perServing.fat, 0) }}g</span>
          <span class="text-muted">{{ t('nutrition.fat') }}</span>
        </span>
        <template v-if="perServing.fiber && perServing.fiber > 0">
          <span class="hidden text-dimmed select-none sm:inline" aria-hidden="true">·</span>
          <span class="flex items-center gap-1">
            <span class="inline-block size-2 rounded-full bg-success-500 shrink-0" />
            <span class="font-medium">{{ fmt(perServing.fiber, 0) }}g</span>
            <span class="text-muted">{{ t('nutrition.fiber') }}</span>
          </span>
        </template>
      </div>

      <!-- Micros toggle + coverage -->
      <div class="flex items-center justify-between gap-3 sm:ml-auto sm:justify-end">
        <UPopover v-if="total.missingCount > 0" mode="hover">
          <button class="flex items-center gap-1 text-xs text-dimmed hover:text-muted transition-colors">
            <UIcon name="i-lucide-info" class="size-4 shrink-0" aria-hidden="true" />
            {{ t('nutrition.missingCount', { n: total.missingCount }) }}
          </button>
          <template #content>
            <div class="p-3 max-w-xs">
              <p class="text-xs font-semibold mb-2">{{ t('nutrition.missingIngredientsTitle') }}</p>
              <ul class="space-y-0.5">
                <li
                  v-for="name in total.missingIngredients"
                  :key="name"
                  class="text-xs text-muted flex items-center gap-1.5"
                >
                  <span class="inline-block size-1.5 rounded-full bg-accented shrink-0" />
                  {{ name }}
                </li>
              </ul>
            </div>
          </template>
        </UPopover>
        <button
          v-if="hasMicros"
          class="flex items-center gap-1 link text-xs shrink-0"
          @click="showMicros = !showMicros"
        >
          {{ t('nutrition.showMicros') }}
          <UIcon :name="showMicros ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4" />
        </button>
      </div>
    </div>

    <!-- Expanded micros -->
    <template v-if="showMicros && hasMicros">
      <div class="mt-3 pt-3 border-t border-default grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
        <div v-if="vitamins.length > 0">
          <p class="text-xs font-semibold uppercase tracking-wide text-dimmed mb-1.5">
            {{ t('nutrition.vitamins') }}
          </p>
          <div class="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            <div v-for="m in vitamins" :key="m.key" class="rounded bg-default px-2 py-1">
              <div class="text-xs text-muted truncate">{{ m.label }}</div>
              <div class="text-xs font-medium">
                {{ fmt(m.value, m.unit === 'mg' ? 1 : 2) }}<span class="text-dimmed"> {{ m.unit }}</span>
              </div>
            </div>
          </div>
        </div>
        <div v-if="minerals.length > 0">
          <p class="text-xs font-semibold uppercase tracking-wide text-dimmed mb-1.5">
            {{ t('nutrition.minerals') }}
          </p>
          <div class="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            <div v-for="m in minerals" :key="m.key" class="rounded bg-default px-2 py-1">
              <div class="text-xs text-muted truncate">{{ m.label }}</div>
              <div class="text-xs font-medium">
                {{ fmt(m.value, m.unit === 'mg' ? 1 : 2) }}<span class="text-dimmed"> {{ m.unit }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>

  <!-- ── Full card (default) ──────────────────────────────── -->
  <UCard v-else class="mb-6">
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-flame" class="size-5 text-primary" />
          <h2 class="text-lg font-semibold">{{ t('nutrition.title') }}</h2>
          <UBadge
            v-if="total.isApproximate"
            color="warning"
            variant="subtle"
            :class="TINT_CLASS.warning"
            icon="i-lucide-info"
            :label="t('nutrition.approximate')"
            size="xs"
          />
        </div>

        <!-- Per-serving / Total toggle -->
        <div class="flex rounded-lg overflow-hidden border border-default text-sm">
          <button
            :class="[
              'px-3 py-1 transition-colors',
              activeTab === 'serving' ? 'bg-primary text-inverted' : 'hover:bg-elevated',
            ]"
            @click="activeTab = 'serving'"
          >
            {{ t('nutrition.perServing') }}
          </button>
          <button
            :class="[
              'px-3 py-1 transition-colors',
              activeTab === 'total' ? 'bg-primary text-inverted' : 'hover:bg-elevated',
            ]"
            @click="activeTab = 'total'"
          >
            {{ t('nutrition.total') }}
          </button>
        </div>
      </div>
    </template>

    <!-- Energy highlight -->
    <div class="flex items-baseline gap-2 mb-4">
      <span class="text-4xl font-bold text-primary">{{ fmt(current.kcal, 0) }}</span>
      <span class="text-muted">kcal</span>
      <span class="text-sm text-dimmed ml-auto">
        {{
          activeTab === 'serving'
            ? t('nutrition.perServingLabel', { n: servings })
            : t('nutrition.totalLabel', { n: servings })
        }}
      </span>
    </div>

    <!-- Macro ratio bar -->
    <div class="flex h-2 rounded-full overflow-hidden mb-6 bg-elevated">
      <div class="bg-macro-protein transition-all" :style="{ width: macroKcal.protein + '%' }" />
      <div class="bg-macro-carbs transition-all" :style="{ width: macroKcal.carbs + '%' }" />
      <div class="bg-macro-fat transition-all" :style="{ width: macroKcal.fat + '%' }" />
    </div>

    <!-- Macros grid -->
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div v-for="m in macros" :key="m.key" class="rounded-lg bg-elevated px-3 py-2">
        <div class="flex items-center gap-1.5 mb-0.5">
          <span class="inline-block size-2 rounded-full" :class="m.color" />
          <span class="text-xs text-muted">{{ m.label }}</span>
        </div>
        <span class="font-semibold">{{ fmt(m.value) }}</span>
        <span class="text-xs text-dimmed"> {{ m.unit }}</span>
      </div>
    </div>

    <!-- Micronutrients (collapsible) -->
    <template v-if="hasMicros">
      <div class="mt-4 border-t border-default pt-4">
        <button class="flex items-center gap-1.5 link text-sm" @click="showMicros = !showMicros">
          <UIcon :name="showMicros ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4" />
          {{ t('nutrition.showMicros') }}
        </button>

        <template v-if="showMicros">
          <!-- Vitamins -->
          <div v-if="vitamins.length > 0" class="mt-3">
            <p class="text-xs font-semibold uppercase tracking-wide text-dimmed mb-2">
              {{ t('nutrition.vitamins') }}
            </p>
            <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
              <div v-for="m in vitamins" :key="m.key" class="rounded bg-elevated px-2 py-1.5">
                <div class="text-xs text-muted truncate">{{ m.label }}</div>
                <div class="text-sm font-medium leading-tight">
                  {{ fmt(m.value, m.unit === 'mg' ? 1 : 2) }}
                  <span class="text-xs text-dimmed">{{ m.unit }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Minerals -->
          <div v-if="minerals.length > 0" class="mt-3">
            <p class="text-xs font-semibold uppercase tracking-wide text-dimmed mb-2">
              {{ t('nutrition.minerals') }}
            </p>
            <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
              <div v-for="m in minerals" :key="m.key" class="rounded bg-elevated px-2 py-1.5">
                <div class="text-xs text-muted truncate">{{ m.label }}</div>
                <div class="text-sm font-medium leading-tight">
                  {{ fmt(m.value, m.unit === 'mg' ? 1 : 2) }}
                  <span class="text-xs text-dimmed">{{ m.unit }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </template>

    <!-- Coverage disclaimer with popover -->
    <UPopover v-if="total.missingCount > 0" mode="hover" class="mt-4">
      <button class="flex items-center gap-1 text-xs text-dimmed hover:text-muted transition-colors">
        <UIcon name="i-lucide-info" class="size-3.5 shrink-0" />
        {{ t('nutrition.missingCount', { n: total.missingCount }) }}
      </button>
      <template #content>
        <div class="p-3 max-w-xs">
          <p class="text-xs font-semibold mb-2">{{ t('nutrition.missingIngredientsTitle') }}</p>
          <ul class="space-y-0.5">
            <li
              v-for="name in total.missingIngredients"
              :key="name"
              class="text-xs text-muted flex items-center gap-1.5"
            >
              <span class="inline-block size-1.5 rounded-full bg-accented shrink-0" />
              {{ name }}
            </li>
          </ul>
        </div>
      </template>
    </UPopover>
  </UCard>
</template>
