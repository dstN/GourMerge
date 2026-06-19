<script setup lang="ts">
/**
 * GlossaryTerm — Displays a friendly cooking alias with the canonical git term in a tooltip.
 *
 * Usage:
 *   <GlossaryTerm term="fork" />
 *   <GlossaryTerm term="commit" icon />
 *
 * The `term` prop maps to a key in the `glossary` i18n namespace.
 * Each term has:
 *   - `alias`: cooking-friendly name (e.g. "Remix")
 *   - `canonical`: the actual git/GourMerge term (e.g. "Fork")
 *   - `description`: plain-language tooltip explanation
 */
const { t } = useI18n()

const props = defineProps<{
  term: 'fork' | 'branch' | 'commit' | 'merge' | 'gourmergeRequest' | 'diff' | 'history'
  /** Show the canonical term instead of the alias */
  canonical?: boolean
  /** Show a help icon next to the term */
  icon?: boolean
  /** Custom CSS class for the trigger span */
  class?: string
}>()

const alias = computed(() => t(`glossary.${props.term}.alias`))
const canonicalTerm = computed(() => t(`glossary.${props.term}.canonical`))
const description = computed(() => t(`glossary.${props.term}.description`))
const displayText = computed(() => (props.canonical ? canonicalTerm.value : alias.value))
</script>

<template>
  <UTooltip :text="`${canonicalTerm} — ${description}`" :delay-duration="300">
    <span
      :class="[
        'inline-flex items-center gap-0.5 cursor-help border-b border-dashed border-current/40 hover:border-current/80 transition-colors',
        props.class,
      ]"
      role="term"
      :aria-label="`${displayText} (${canonicalTerm})`"
    >
      {{ displayText }}
      <UIcon v-if="icon" name="i-lucide-info" class="size-3 text-current/50 shrink-0" aria-hidden="true" />
    </span>
  </UTooltip>
</template>
