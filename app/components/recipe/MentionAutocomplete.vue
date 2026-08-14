<script setup lang="ts">
/**
 * MentionAutocomplete — a `UTextarea` drop-in that shows a username dropdown while typing
 * `@name`.
 *
 * The dropdown is anchored below the textarea, not pixel-tracking the caret — `UTextarea`
 * exposes no caret-geometry API, and building one (a mirrored-div trick) is a lot of
 * effort for a small visual-polish gain on what is otherwise a small feature. Selecting a
 * result splices `@username ` into the string at the token's exact string offset via
 * `selectionStart`/`selectionEnd`, the same idea `IngredientAutocomplete.vue` uses for its
 * own dropdown, adapted for a multi-line field where the token can be anywhere in the text
 * rather than the whole input.
 */
const props = defineProps<{
  modelValue: string
  placeholder?: string
  rows?: number
  maxlength?: number
  ariaLabel?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

interface MentionUser {
  id: number
  username: string
  displayName: string | null
  avatarUrl: string | null
}

const textareaComponentRef = ref<{ textareaRef?: HTMLTextAreaElement } | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const dropdownPos = ref({ top: '0px', left: '0px', width: '0px' })

const options = ref<MentionUser[]>([])
const activeIndex = ref(0)
const loading = ref(false)
let searchTimeout: ReturnType<typeof setTimeout>

// The in-progress `@token` immediately before the caret, and where it starts/ends in the
// string — set by `detectToken()` on every input, cleared when there is none.
const tokenStart = ref<number | null>(null)
const tokenEnd = ref<number | null>(null)

const showDropdown = computed(() => tokenStart.value !== null && options.value.length > 0)

function nativeTextarea(): HTMLTextAreaElement | undefined {
  return textareaComponentRef.value?.textareaRef
}

function positionDropdown() {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  dropdownPos.value = { top: `${rect.bottom + 4}px`, left: `${rect.left}px`, width: `${Math.max(rect.width, 220)}px` }
}

function detectToken(value: string, caret: number) {
  const upToCaret = value.slice(0, caret)
  const match = /(?:^|\s)@([a-zA-Z0-9_-]{0,49})$/.exec(upToCaret)
  if (!match) {
    tokenStart.value = null
    tokenEnd.value = null
    options.value = []
    return
  }
  const query = match[1]!
  tokenEnd.value = caret
  tokenStart.value = caret - query.length - 1 // include the '@'

  clearTimeout(searchTimeout)
  if (query.length === 0) {
    options.value = []
    return
  }
  loading.value = true
  searchTimeout = setTimeout(async () => {
    try {
      options.value = await $fetch<MentionUser[]>('/api/users/search', { query: { q: query } })
      activeIndex.value = 0
      nextTick(positionDropdown)
    } catch {
      options.value = []
    } finally {
      loading.value = false
    }
  }, 250)
}

function onUpdate(value: string) {
  emit('update:modelValue', value)
  nextTick(() => {
    const el = nativeTextarea()
    if (el) detectToken(value, el.selectionStart ?? value.length)
  })
}

function closeDropdown() {
  tokenStart.value = null
  tokenEnd.value = null
  options.value = []
}

function select(user: MentionUser) {
  if (tokenStart.value === null || tokenEnd.value === null) return
  const before = props.modelValue.slice(0, tokenStart.value)
  const after = props.modelValue.slice(tokenEnd.value)
  const inserted = `@${user.username} `
  const next = `${before}${inserted}${after}`
  emit('update:modelValue', next)
  closeDropdown()

  nextTick(() => {
    const el = nativeTextarea()
    if (!el) return
    const caret = before.length + inserted.length
    el.focus()
    el.setSelectionRange(caret, caret)
  })
}

function onKeydown(e: KeyboardEvent) {
  if (!showDropdown.value) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % options.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + options.value.length) % options.value.length
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    const chosen = options.value[activeIndex.value]
    if (chosen) select(chosen)
  } else if (e.key === 'Escape') {
    closeDropdown()
  }
}
</script>

<template>
  <div ref="containerRef" class="relative">
    <UTextarea
      ref="textareaComponentRef"
      :model-value="modelValue"
      :placeholder="placeholder"
      :rows="rows"
      :maxlength="maxlength"
      :aria-label="ariaLabel"
      @update:model-value="onUpdate"
      @keydown="onKeydown"
      @blur="closeDropdown"
    />
    <div
      v-if="showDropdown"
      class="fixed z-[200] bg-default border border-default rounded-lg shadow-lg max-h-48 overflow-y-auto"
      :style="dropdownPos"
    >
      <button
        v-for="(user, i) in options"
        :key="user.id"
        type="button"
        class="w-full flex items-center gap-2 text-left px-3 py-2 text-sm transition-colors"
        :class="i === activeIndex ? 'bg-elevated' : 'hover:bg-elevated'"
        @mousedown.prevent="select(user)"
      >
        <CommonUserAvatar
          :username="user.username"
          :display-name="user.displayName"
          :avatar-url="user.avatarUrl"
          size="xs"
        />
        <span>{{ user.displayName || user.username }}</span>
        <span class="text-dimmed">@{{ user.username }}</span>
      </button>
    </div>
  </div>
</template>
