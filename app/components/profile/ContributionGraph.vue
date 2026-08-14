<script setup lang="ts">
/**
 * ContributionGraph — a GitHub-style heatmap, last 12 months.
 *
 * Sequential (magnitude) encoding, not categorical: one hue, monotone opacity steps.
 * Zero commits is a neutral EMPTY tile (`bg-elevated`), not "the lightest step of the
 * ramp" — absence isn't a small amount of the thing being measured, it's the absence of
 * it. Uses `bg-primary-500` at increasing opacity rather than fixed Tailwind steps
 * (`primary-100`/`-300`/...), which sidesteps needing every step of Nuxt UI's dynamic
 * primary scale to exist and stays light/dark-mode aware automatically — no new palette,
 * no dark-mode variant to hand-author, per DESIGNBOOK's "one place per visual decision".
 */
const props = defineProps<{
  days: Array<{ day: string; commits: number }>
}>()

const { t, locale } = useI18n()

const cells = computed(() => {
  const countByDay = new Map(props.days.map((d) => [d.day, d.commits]))
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Start on the Sunday on/before 364 days ago, so the grid always begins a full week.
  const start = new Date(today)
  start.setDate(start.getDate() - 364)
  start.setDate(start.getDate() - start.getDay())

  const result: Array<{ date: Date; key: string; commits: number }> = []
  const cursor = new Date(start)
  while (cursor <= today) {
    const key = cursor.toISOString().slice(0, 10)
    result.push({ date: new Date(cursor), key, commits: countByDay.get(key) ?? 0 })
    cursor.setDate(cursor.getDate() + 1)
  }
  return result
})

const weeks = computed(() => {
  const list = cells.value
  const out: (typeof list)[] = []
  for (let i = 0; i < list.length; i += 7) out.push(list.slice(i, i + 7))
  return out
})

const maxCommits = computed(() => Math.max(1, ...props.days.map((d) => d.commits)))

function levelFor(commits: number): 0 | 1 | 2 | 3 | 4 {
  if (commits === 0) return 0
  const ratio = commits / maxCommits.value
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}

const LEVEL_CLASS: Record<number, string> = {
  0: 'bg-elevated border border-default',
  1: 'bg-primary-500/20',
  2: 'bg-primary-500/45',
  3: 'bg-primary-500/70',
  4: 'bg-primary-500',
}

function ariaLabelFor(cell: { date: Date; commits: number }): string {
  const dateLabel = new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'long', year: 'numeric' }).format(
    cell.date
  )
  return t('profile.contributionCellLabel', { count: cell.commits, date: dateLabel })
}
</script>

<template>
  <div>
    <div class="flex gap-1 overflow-x-auto pb-1">
      <div v-for="(week, wi) in weeks" :key="wi" class="flex flex-col gap-1">
        <div
          v-for="cell in week"
          :key="cell.key"
          class="size-3 rounded-sm"
          :class="LEVEL_CLASS[levelFor(cell.commits)]"
          :aria-label="ariaLabelFor(cell)"
          :title="ariaLabelFor(cell)"
        />
      </div>
    </div>
    <div class="flex items-center gap-1.5 mt-2 text-xs text-dimmed">
      <span>{{ t('profile.contributionLess') }}</span>
      <div v-for="level in [0, 1, 2, 3, 4]" :key="level" class="size-3 rounded-sm" :class="LEVEL_CLASS[level]" />
      <span>{{ t('profile.contributionMore') }}</span>
    </div>
  </div>
</template>
