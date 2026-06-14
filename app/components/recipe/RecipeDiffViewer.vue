<script setup lang="ts">
/**
 * RecipeDiffViewer — GitHub-style diff viewer for GourMerge Requests
 *
 * Displays the differences between two recipe commit versions:
 * - Structured ingredient diff (table with add/remove/modify highlighting)
 * - Text diff for Markdown recipe steps (inline additions/deletions)
 *
 * Uses Nuxt UI v4 components and is fully i18n-ready.
 *
 * @example
 * <RecipeDiffViewer :diff="commitDiffData" />
 */

import type { CommitDiff, IngredientDiffEntry, StepDiffEntry, TextDiffSegment } from '~~/shared/types'

const { t } = useI18n()

const props = defineProps<{
  /** The computed diff between two commits */
  diff: CommitDiff
  /** Whether to show unchanged items (default: false) */
  showUnchanged?: boolean
}>()

// ── Reactive state ────────────────────────────────────────────

const activeTab = ref<'ingredients' | 'steps'>('ingredients')
const stepViewMode = ref<'unified' | 'split'>('unified')

// ── Computed ──────────────────────────────────────────────────

const filteredIngredients = computed(() => {
  if (props.showUnchanged) return props.diff.ingredients
  return props.diff.ingredients.filter((d) => d.type !== 'unchanged')
})

const filteredSteps = computed(() => {
  if (props.showUnchanged) return props.diff.steps
  return props.diff.steps.filter((d) => d.type !== 'unchanged')
})

const hasChanges = computed(() => {
  const s = props.diff.summary
  return (
    s.ingredientsAdded + s.ingredientsRemoved + s.ingredientsModified +
    s.stepsAdded + s.stepsRemoved + s.stepsModified
  ) > 0
})

// ── Tab items ─────────────────────────────────────────────────

const tabItems = computed(() => [
  {
    label: t('diff.ingredients'),
    value: 'ingredients' as const,
    badge: props.diff.ingredients.filter((d) => d.type !== 'unchanged').length || undefined,
  },
  {
    label: t('diff.steps'),
    value: 'steps' as const,
    badge: props.diff.steps.filter((d) => d.type !== 'unchanged').length || undefined,
  },
])

// ── Helpers ───────────────────────────────────────────────────

function getDiffIcon(type: string): string {
  switch (type) {
    case 'added': return 'i-lucide-plus'
    case 'removed': return 'i-lucide-minus'
    case 'modified': return 'i-lucide-pencil'
    default: return 'i-lucide-equal'
  }
}

type BadgeColor = 'success' | 'primary' | 'secondary' | 'info' | 'warning' | 'error' | 'neutral'
function getDiffColor(type: string): BadgeColor {
  switch (type) {
    case 'added': return 'success'
    case 'removed': return 'error'
    case 'modified': return 'warning'
    default: return 'neutral'
  }
}

function getDiffRowClass(type: string): string {
  switch (type) {
    case 'added': return 'diff-added'
    case 'removed': return 'diff-removed'
    case 'modified': return 'diff-modified'
    default: return ''
  }
}

function getSegmentClass(type: number): string {
  switch (type) {
    case 1: return 'diff-inline-added'
    case -1: return 'diff-inline-removed'
    default: return ''
  }
}
</script>

<template>
  <div id="recipe-diff-viewer" class="w-full">
    <!-- ── Summary Header ──────────────────────────────────── -->
    <UCard
      v-if="hasChanges"
      class="mb-6"
    >
      <template #header>
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-git-compare" class="text-primary-500 size-5" />
          <h3 class="text-lg font-semibold">
            {{ t('diff.title') }}
          </h3>
        </div>
      </template>

      <div class="flex flex-wrap gap-3">
        <UBadge
          v-if="diff.summary.ingredientsAdded > 0"
          color="success"
          variant="subtle"
          icon="i-lucide-plus"
          :label="`${diff.summary.ingredientsAdded} ${t('diff.added')}`"
        />
        <UBadge
          v-if="diff.summary.ingredientsRemoved > 0"
          color="error"
          variant="subtle"
          icon="i-lucide-minus"
          :label="`${diff.summary.ingredientsRemoved} ${t('diff.removed')}`"
        />
        <UBadge
          v-if="diff.summary.ingredientsModified > 0"
          color="warning"
          variant="subtle"
          icon="i-lucide-pencil"
          :label="`${diff.summary.ingredientsModified} ${t('diff.modified')}`"
        />
        <USeparator orientation="vertical" class="h-6" />
        <UBadge
          v-if="diff.summary.stepsAdded > 0"
          color="success"
          variant="subtle"
          icon="i-lucide-plus"
          :label="`${diff.summary.stepsAdded} ${t('diff.steps')} ${t('diff.added').toLowerCase()}`"
        />
        <UBadge
          v-if="diff.summary.stepsRemoved > 0"
          color="error"
          variant="subtle"
          icon="i-lucide-minus"
          :label="`${diff.summary.stepsRemoved} ${t('diff.steps')} ${t('diff.removed').toLowerCase()}`"
        />
        <UBadge
          v-if="diff.summary.stepsModified > 0"
          color="warning"
          variant="subtle"
          icon="i-lucide-pencil"
          :label="`${diff.summary.stepsModified} ${t('diff.steps')} ${t('diff.modified').toLowerCase()}`"
        />
      </div>
    </UCard>

    <!-- ── No Changes ──────────────────────────────────────── -->
    <UCard v-if="!hasChanges" class="text-center py-8">
      <UIcon name="i-lucide-check-circle" class="text-success-500 size-12 mb-3 mx-auto" />
      <p class="text-lg font-medium text-[var(--ui-text-muted)]">
        {{ t('diff.noChanges') }}
      </p>
    </UCard>

    <!-- ── Tabbed Diff View ────────────────────────────────── -->
    <UTabs
      v-if="hasChanges"
      v-model="activeTab"
      :items="tabItems"
      class="w-full"
    >
      <template #content="{ item }">
        <!-- ── Ingredient Diff Tab ─────────────────────────── -->
        <div v-if="item.value === 'ingredients'" class="mt-4">
          <div
            v-if="filteredIngredients.length === 0"
            class="text-center py-6 text-[var(--ui-text-muted)]"
          >
            {{ t('diff.noChanges') }}
          </div>

          <div v-else class="rounded-lg border border-[var(--ui-border)] overflow-hidden">
            <!-- Table Header -->
            <div class="grid grid-cols-12 gap-0 bg-[var(--ui-bg-elevated)] border-b border-[var(--ui-border)] px-4 py-2.5 text-sm font-semibold text-[var(--ui-text-muted)]">
              <div class="col-span-1" />
              <div class="col-span-4">
                {{ t('diff.ingredient') }}
              </div>
              <div class="col-span-3 text-right">
                {{ t('diff.oldValue') }}
              </div>
              <div class="col-span-1 text-center">
                →
              </div>
              <div class="col-span-3">
                {{ t('diff.newValue') }}
              </div>
            </div>

            <!-- Diff Rows -->
            <div
              v-for="(entry, idx) in filteredIngredients"
              :key="`ing-${entry.ingredientId}-${idx}`"
              :class="[
                'grid grid-cols-12 gap-0 px-4 py-2.5 border-b border-[var(--ui-border)] last:border-b-0 transition-colors text-sm',
                getDiffRowClass(entry.type),
              ]"
            >
              <!-- Status icon -->
              <div class="col-span-1 flex items-center">
                <UBadge
                  :color="getDiffColor(entry.type)"
                  variant="subtle"
                  :icon="getDiffIcon(entry.type)"
                  size="xs"
                />
              </div>

              <!-- Ingredient name -->
              <div class="col-span-4 flex items-center font-medium">
                {{ entry.ingredientName }}
              </div>

              <!-- Old value -->
              <div class="col-span-3 flex items-center justify-end font-mono text-sm">
                <template v-if="entry.type === 'removed' || entry.type === 'modified'">
                  <span :class="{ 'line-through opacity-60': entry.type === 'modified' }">
                    {{ entry.oldQuantity }} {{ entry.oldUnit }}
                  </span>
                </template>
                <template v-else-if="entry.type === 'unchanged'">
                  {{ entry.oldQuantity }} {{ entry.oldUnit }}
                </template>
                <span v-else class="text-[var(--ui-text-dimmed)]">—</span>
              </div>

              <!-- Arrow -->
              <div class="col-span-1 flex items-center justify-center text-[var(--ui-text-dimmed)]">
                <UIcon
                  v-if="entry.type === 'modified'"
                  name="i-lucide-arrow-right"
                  class="size-4"
                />
              </div>

              <!-- New value -->
              <div class="col-span-3 flex items-center font-mono text-sm">
                <template v-if="entry.type === 'added' || entry.type === 'modified'">
                  <span class="font-semibold">
                    {{ entry.newQuantity }} {{ entry.newUnit }}
                  </span>
                </template>
                <template v-else-if="entry.type === 'unchanged'">
                  {{ entry.newQuantity }} {{ entry.newUnit }}
                </template>
                <span v-else class="text-[var(--ui-text-dimmed)]">—</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Steps Diff Tab ──────────────────────────────── -->
        <div v-if="item.value === 'steps'" class="mt-4">
          <!-- View mode toggle -->
          <div class="flex justify-end mb-3">
            <UFieldGroup size="xs">
              <UButton
                :label="t('diff.viewUnified')"
                :variant="stepViewMode === 'unified' ? 'solid' : 'outline'"
                color="neutral"
                icon="i-lucide-align-justify"
                @click="stepViewMode = 'unified'"
              />
              <UButton
                :label="t('diff.viewSplit')"
                :variant="stepViewMode === 'split' ? 'solid' : 'outline'"
                color="neutral"
                icon="i-lucide-columns-2"
                @click="stepViewMode = 'split'"
              />
            </UFieldGroup>
          </div>

          <div
            v-if="filteredSteps.length === 0"
            class="text-center py-6 text-[var(--ui-text-muted)]"
          >
            {{ t('diff.noChanges') }}
          </div>

          <!-- Step diff entries -->
          <div class="space-y-4">
            <UCard
              v-for="(step, idx) in filteredSteps"
              :key="`step-${step.sortOrder}-${idx}`"
              :class="getDiffRowClass(step.type)"
            >
              <template #header>
                <div class="flex items-center gap-2">
                  <UBadge
                    :color="getDiffColor(step.type)"
                    variant="subtle"
                    :icon="getDiffIcon(step.type)"
                    :label="t('diff.' + step.type)"
                    size="sm"
                  />
                  <span class="text-sm font-semibold">
                    {{ t('diff.stepNumber', { n: step.sortOrder }) }}
                  </span>
                </div>
              </template>

              <!-- Unified view -->
              <div v-if="stepViewMode === 'unified'">
                <!-- Added step: show new content -->
                <div
                  v-if="step.type === 'added'"
                  class="diff-inline-added p-3 rounded-md font-mono text-sm whitespace-pre-wrap"
                >
                  {{ step.newContent }}
                </div>

                <!-- Removed step: show old content -->
                <div
                  v-else-if="step.type === 'removed'"
                  class="diff-inline-removed p-3 rounded-md font-mono text-sm whitespace-pre-wrap"
                >
                  {{ step.oldContent }}
                </div>

                <!-- Modified step: show inline diff -->
                <div
                  v-else-if="step.type === 'modified' && step.segments"
                  class="p-3 rounded-md font-mono text-sm whitespace-pre-wrap leading-relaxed"
                >
                  <span
                    v-for="(segment, segIdx) in step.segments"
                    :key="`seg-${segIdx}`"
                    :class="getSegmentClass(segment.type)"
                  >{{ segment.text }}</span>
                </div>

                <!-- Unchanged step -->
                <div
                  v-else
                  class="p-3 rounded-md font-mono text-sm whitespace-pre-wrap opacity-60"
                >
                  {{ step.oldContent }}
                </div>
              </div>

              <!-- Split view -->
              <div v-else class="grid grid-cols-2 gap-4">
                <!-- Old (left) -->
                <div class="rounded-md border border-[var(--ui-border)] overflow-hidden">
                  <div class="px-3 py-1.5 bg-[var(--ui-bg-elevated)] text-xs font-semibold text-[var(--ui-text-muted)] border-b border-[var(--ui-border)]">
                    {{ t('diff.oldValue') }}
                  </div>
                  <div class="p-3 font-mono text-sm whitespace-pre-wrap">
                    <template v-if="step.oldContent">
                      {{ step.oldContent }}
                    </template>
                    <span v-else class="text-[var(--ui-text-dimmed)] italic">
                      {{ t('diff.noChanges') }}
                    </span>
                  </div>
                </div>

                <!-- New (right) -->
                <div class="rounded-md border border-[var(--ui-border)] overflow-hidden">
                  <div class="px-3 py-1.5 bg-[var(--ui-bg-elevated)] text-xs font-semibold text-[var(--ui-text-muted)] border-b border-[var(--ui-border)]">
                    {{ t('diff.newValue') }}
                  </div>
                  <div class="p-3 font-mono text-sm whitespace-pre-wrap">
                    <template v-if="step.newContent">
                      {{ step.newContent }}
                    </template>
                    <span v-else class="text-[var(--ui-text-dimmed)] italic">
                      {{ t('diff.noChanges') }}
                    </span>
                  </div>
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </template>
    </UTabs>
  </div>
</template>
