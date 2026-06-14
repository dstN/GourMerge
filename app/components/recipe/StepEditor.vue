<script setup lang="ts">
/**
 * StepEditor — TipTap 3 WYSIWYG editor for a single recipe step.
 *
 * - Wrapped in <ClientOnly> at usage site (or immediatelyRender: false here)
 * - Uses StarterKit + @tiptap/markdown for Markdown output
 * - Images explicitly disabled (text-only per ARCHITECTURE decision)
 * - Emits Markdown string on every content change
 */
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { StarterKit } from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'

const { t } = useI18n()

const props = defineProps<{
  modelValue: string
  index: number
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'remove': []
}>()

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
    const md = ed.getMarkdown?.() ?? ed.getText()
    emit('update:modelValue', md)
  },
})

// Sync external modelValue → editor (e.g. when parent resets or loads initial data)
watch(() => props.modelValue, (newVal) => {
  if (!editor.value) return
  const currentMd = editor.value.getMarkdown?.() ?? ''
  if (newVal !== currentMd) {
    editor.value.commands.setContent(newVal)
  }
})

onBeforeUnmount(() => editor.value?.destroy())
</script>

<template>
  <div class="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden group" :data-tour="`step-editor-${index}`">
    <!-- Toolbar -->
    <div class="flex items-center gap-1 px-2 py-1 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800">
      <span class="text-xs font-medium text-neutral-500 mr-2">{{ t('diff.stepNumber', { n: index + 1 }) }}</span>

      <UButton
        v-if="editor"
        icon="i-lucide-bold"
        size="xs"
        variant="ghost"
        color="neutral"
        :class="{ 'bg-neutral-200 dark:bg-neutral-700': editor.isActive('bold') }"
        :aria-label="'Bold'"
        @click="editor.chain().focus().toggleBold().run()"
      />
      <UButton
        v-if="editor"
        icon="i-lucide-italic"
        size="xs"
        variant="ghost"
        color="neutral"
        :class="{ 'bg-neutral-200 dark:bg-neutral-700': editor.isActive('italic') }"
        :aria-label="'Italic'"
        @click="editor.chain().focus().toggleItalic().run()"
      />
      <UButton
        v-if="editor"
        icon="i-lucide-list"
        size="xs"
        variant="ghost"
        color="neutral"
        :class="{ 'bg-neutral-200 dark:bg-neutral-700': editor.isActive('bulletList') }"
        :aria-label="'Bullet list'"
        @click="editor.chain().focus().toggleBulletList().run()"
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
    <EditorContent
      v-if="editor"
      :editor="editor"
      class="bg-white dark:bg-neutral-900"
    />
    <div
      v-else
      class="min-h-[4rem] p-3 text-neutral-400 text-sm"
    >
      {{ placeholder ?? t('recipe.stepPlaceholder') }}
    </div>
  </div>
</template>
