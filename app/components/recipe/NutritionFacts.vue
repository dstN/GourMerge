<script setup lang="ts">
import type { NutritionTotals } from '~~/shared/types/recipe'

const { t } = useI18n()

const props = defineProps<{
  total: NutritionTotals
  perServing: NutritionTotals
  servings: number
}>()

const activeTab = ref<'serving' | 'total'>('serving')

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
