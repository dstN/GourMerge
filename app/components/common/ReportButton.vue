<script setup lang="ts">
/**
 * CommonReportButton — flags a recipe, user, discussion comment or image for moderation.
 *
 * Owns the modal and the submit call; the trigger is a slot rather than a fixed button, so
 * a recipe page can put it in an overflow menu next to six already-icon-only actions
 * (DESIGNBOOK §2.4 — this is one more of those, not a good reason to add a seventh), while
 * a profile page or a single comment can render it as a plain small button instead. One
 * component, two very different places to stand.
 */
const props = defineProps<{
  targetKind: 'recipe' | 'user' | 'discussion_comment' | 'image' | 'ingredient'
  targetId: number
}>()

const { t } = useI18n()
const { apiError } = useApiError()
const toast = useAppToast()

const REASONS = ['spam', 'inappropriate', 'copyright', 'harassment', 'incorrect_data', 'other'] as const
type Reason = (typeof REASONS)[number]

const open = ref(false)
const submitting = ref(false)
const reason = ref<Reason>('inappropriate')
const note = ref('')

function openModal() {
  reason.value = 'inappropriate'
  note.value = ''
  open.value = true
}

// The default slot passes `open` for a visible trigger (profile page, a single comment).
// Exposed too for callers driving it from outside the template — a dropdown menu item
// (the recipe page's overflow menu) has nowhere to put a scoped slot at all.
defineExpose({ open: openModal })

async function submit() {
  submitting.value = true
  try {
    const res = await $fetch<{ alreadyReported: boolean }>('/api/reports', {
      method: 'POST',
      body: {
        targetKind: props.targetKind,
        targetId: props.targetId,
        reason: reason.value,
        note: note.value.trim() || undefined,
      },
    })
    open.value = false
    toast.success(res.alreadyReported ? t('report.alreadyReported') : t('report.success'))
  } catch (e: unknown) {
    toast.error(apiError(e, 'report.error'))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <slot :open="openModal" />

  <UModal v-model:open="open" :title="t('report.title')">
    <template #body>
      <div class="space-y-4">
        <UFormField :label="t('report.reasonLabel')">
          <USelect
            v-model="reason"
            :items="REASONS.map((r) => ({ label: t(`report.reason.${r}`), value: r }))"
            value-key="value"
          />
        </UFormField>
        <UFormField :label="t('report.noteLabel')" :hint="t('common.optional')">
          <UTextarea v-model="note" :placeholder="t('report.notePlaceholder')" :rows="3" :maxlength="2000" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="subtle" :label="t('common.cancel')" @click="open = false" />
        <UButton color="error" icon="i-lucide-flag" :label="t('report.submit')" :loading="submitting" @click="submit" />
      </div>
    </template>
  </UModal>
</template>
