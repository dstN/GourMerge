<script setup lang="ts">
/**
 * HelpHint — A ? icon that opens a popover with contextual help text.
 *
 * Usage (Nuxt path-prefixes components in components/common/):
 *   <CommonHelpHint i18n-key="glossary.fork.helpHint" />
 *   <CommonHelpHint text="This creates an independent copy of the recipe." />
 */
const { t } = useI18n()

const props = defineProps<{
  /** i18n key for the help text */
  i18nKey?: string
  /** Or pass text directly */
  text?: string
  /** Optional heading (i18n key or raw string) */
  title?: string
  /**
   * Size of the ? icon. Must match the buttons it sits beside — DESIGNBOOK §2.3 asks for
   * one height per cluster, and a hint that is 8px shorter than its neighbours reads as
   * misalignment rather than as a quieter affordance. `lg` exists for exactly that.
   */
  size?: 'xs' | 'sm' | 'md' | 'lg'
}>()

const helpText = computed(() => props.text ?? (props.i18nKey ? t(props.i18nKey) : ''))
const titleText = computed(() => (props.title ? (props.title.includes('.') ? t(props.title) : props.title) : undefined))

const open = ref(false)
</script>

<template>
  <UPopover v-model:open="open" :content="{ side: 'top', align: 'center' }">
    <UButton
      icon="i-lucide-circle-help"
      :size="size ?? 'xs'"
      variant="ghost"
      color="neutral"
      class="opacity-60 hover:opacity-100 transition-opacity"
      :aria-label="t('common.help')"
      :aria-expanded="open"
    />

    <template #content>
      <div class="p-3 max-w-xs">
        <p v-if="titleText" class="font-medium text-sm mb-1">{{ titleText }}</p>
        <p class="text-sm text-muted">{{ helpText }}</p>
      </div>
    </template>
  </UPopover>
</template>
