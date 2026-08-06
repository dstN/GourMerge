<script setup lang="ts">
/**
 * StepEditor — TipTap 3 WYSIWYG editor for a single recipe step.
 *
 * - Wrapped in <ClientOnly> at usage site so it only mounts client-side (SSR-safe)
 * - Uses StarterKit + @tiptap/markdown for Markdown output
 * - Images explicitly disabled (text-only per ARCHITECTURE decision)
 * - Emits Markdown string on every content change
 */
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { nextTick } from 'vue'
import { StarterKit } from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'

const { t } = useI18n()

const props = defineProps<{
  modelValue: string
  index: number
  placeholder?: string
  /**
   * Language this editor holds, shown as a badge in the toolbar. The main step editor had
   * no language marker at all, so it was never clear which language the text was in —
   * which in turn made "add translations" ambiguous about what to translate from.
   */
  localeBadge?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  remove: []
}>()

// Prevents onUpdate from re-emitting when we programmatically set content from a prop change
const settingContent = ref(false)

const editor = useEditor({
  content: props.modelValue,
  extensions: [
    StarterKit.configure({
      // Images are disabled project-wide (text-only v1)
      // StarterKit doesn't include image by default, so no config needed
    }),
    Markdown,
  ],
  editorProps: {
    attributes: {
      class: 'prose prose-sm max-w-none focus:outline-none min-h-[4rem] p-3',
    },
  },
  onUpdate: ({ editor: ed }) => {
    if (!settingContent.value) emit('update:modelValue', ed.getHTML())
  },
})

// Sync external modelValue → editor when parent loads/resets data (e.g. branch switch).
// Treat '' and '<p></p>' as equivalent empty states to avoid calling setContent on
// every tick, which would reset the cursor and block the user from typing.
watch(
  () => props.modelValue,
  (newVal) => {
    if (!editor.value) return
    const currentHtml = editor.value.getHTML()
    const isEmpty = (s: string) => !s || s === '<p></p>' || s === '<p><br></p>'
    if (isEmpty(newVal) && isEmpty(currentHtml)) return
    if (newVal !== currentHtml) {
      settingContent.value = true
      editor.value.commands.setContent(newVal)
      nextTick(() => {
        settingContent.value = false
      })
    }
  }
)

onBeforeUnmount(() => editor.value?.destroy())
</script>

<template>
  <div class="group overflow-hidden rounded-lg border border-default" :data-tour="`step-editor-${index}`">
    <!-- Toolbar -->
    <div class="flex items-center gap-1 border-b border-default bg-elevated px-2 py-1">
      <span class="text-xs font-medium text-muted">{{ t('diff.stepNumber', { n: index + 1 }) }}</span>
      <UBadge
        v-if="localeBadge"
        :label="localeBadge"
        color="neutral"
        variant="subtle"
        size="sm"
        class="mr-1 font-mono uppercase"
      />
      <span class="mr-1" />

      <UButton
        v-if="editor"
        icon="i-lucide-bold"
        size="xs"
        variant="ghost"
        color="neutral"
        :class="{ 'bg-accented': editor.isActive('bold') }"
        :aria-label="t('editor.bold')"
        @click="
          () => {
            editor?.chain().focus().toggleBold().run()
          }
        "
      />
      <UButton
        v-if="editor"
        icon="i-lucide-italic"
        size="xs"
        variant="ghost"
        color="neutral"
        :class="{ 'bg-accented': editor.isActive('italic') }"
        :aria-label="t('editor.italic')"
        @click="
          () => {
            editor?.chain().focus().toggleItalic().run()
          }
        "
      />
      <UButton
        v-if="editor"
        icon="i-lucide-list"
        size="xs"
        variant="ghost"
        color="neutral"
        :class="{ 'bg-accented': editor.isActive('bulletList') }"
        :aria-label="t('editor.bulletList')"
        @click="
          () => {
            editor?.chain().focus().toggleBulletList().run()
          }
        "
      />

      <!-- Spacer + remove button -->
      <div class="flex-1" />
      <UButton
        icon="i-lucide-trash-2"
        size="xs"
        variant="ghost"
        color="error"
        class="opacity-0 group-hover:opacity-100 transition-opacity"
        :aria-label="t('common.delete')"
        @click="emit('remove')"
      />
    </div>

    <!-- Editor content area -->
    <EditorContent v-if="editor" :editor="editor" class="bg-default" />
    <div v-else class="min-h-16 p-3 text-sm text-dimmed">
      {{ placeholder ?? t('recipe.stepPlaceholder') }}
    </div>
  </div>
</template>
