#!/usr/bin/env node
/**
 * design-check — enforces the mechanically-checkable rules in DESIGNBOOK.md.
 *
 * The axe a11y gate checks contrast; the i18n gate checks translation parity.
 * Neither catches *inconsistency*: four button sizes with no rule, `w-full` on
 * nine form controls and missing from twenty-three identical ones, nine page
 * widths against a max-w-7xl header. That drift is what this script catches.
 *
 * Run: `npm run design:check` (part of `npm run lint`, and a CI step).
 * Every rule cites its design-book section so a failure is self-explaining.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()

/** Form controls whose width and size are set centrally in app.config.ts (§3). */
const FORM_CONTROLS = ['UInput', 'UTextarea', 'USelect', 'USelectMenu', 'UInputMenu', 'UInputNumber']

/**
 * Pages allowed to not use <CommonPageShell> as their template root (§4.2):
 * - index.vue      — full-bleed marketing sections, each with its own shell inside
 * - explore.vue    — dynamic <NuxtLayout> root; the shell is the layout's child
 * - auth/*         — the auth layout supplies the cap and centring
 */
const SHELL_EXEMPT = [
  'app/pages/index.vue',
  'app/pages/explore.vue',
  'app/pages/auth/login.vue',
  'app/pages/auth/register.vue',
  'app/pages/auth/forgot-password.vue',
  'app/pages/auth/reset-password.vue',
  'app/pages/auth/verified.vue',
]

/** Raw palette hues that must go through the semantic ramp or a --gm-* token (§1.1). */
const RAW_HUE =
  /(?:^|[\s"'`:[])(?:text|bg|border|ring|divide|from|to|via|decoration|outline|fill|stroke|shadow)-(?:amber|orange|yellow|red|green|lime|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|neutral|gray|zinc|stone)-\d{2,3}\b/

const findings = []

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.vue')) out.push(p)
  }
  return out
}

/** Extract the `<template>` block, so script-only strings don't trip class rules. */
function templateOf(src) {
  const start = src.indexOf('<template>')
  if (start === -1) return { text: '', offset: 0 }
  return { text: src.slice(start), offset: start }
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length
}

function report(file, line, rule, section, message) {
  findings.push({ file, line, rule, section, message })
}

/** Every `class="…"` / `:class="…"` value in a chunk, with its absolute offset. */
function* classAttrs(text, offset) {
  const re = /(?::|v-bind:)?class="([^"]*)"/g
  let m
  while ((m = re.exec(text))) yield { value: m[1], index: offset + m.index }
}

/**
 * Each Nuxt UI component tag with its raw attribute string.
 *
 * Quote-aware on purpose: a Vue expression may contain `>` —
 * `v-if="summary.added > 0"` — so a `[^<>]*?` body regex silently truncates the
 * tag and every attribute rule below would skip whatever followed. That exact bug
 * made a batch edit inject duplicate attributes into six badges.
 */
function* uiTags(text, offset) {
  const open = /<(U[A-Za-z]+)(?=[\s/>])/g
  let m
  while ((m = open.exec(text))) {
    let quote = null
    let end = -1
    for (let i = m.index + m[0].length; i < text.length; i++) {
      const c = text[i]
      if (quote) {
        if (c === quote) quote = null
        continue
      }
      if (c === '"' || c === "'") {
        quote = c
        continue
      }
      if (c === '>') {
        end = i
        break
      }
    }
    if (end === -1) break
    const raw = text.slice(m.index + m[0].length, end).replace(/\/$/, '')
    yield { tag: m[1], attrs: raw, index: offset + m.index }
    open.lastIndex = end + 1
  }
}

for (const abs of walk(join(ROOT, 'app'))) {
  const file = relative(ROOT, abs).split(sep).join('/')
  const src = readFileSync(abs, 'utf8')
  const tpl = templateOf(src)
  const isPage = file.startsWith('app/pages/')
  // main.css is the sanctioned home for raw palette literals; this loop is .vue only.

  // ── Rule 1: arbitrary --ui-* classes (§1.2) ────────────────────
  for (const { value, index } of classAttrs(tpl.text, tpl.offset)) {
    const hit = /\[var\(--ui-[a-z-]+\)\]/.exec(value)
    if (hit) {
      report(
        file,
        lineOf(src, index),
        'arbitrary-ui-var',
        '§1.2',
        `\`${hit[0]}\` — use the semantic utility (text-muted / bg-elevated / border-default …)`
      )
    }
  }

  // ── Rule 2: raw palette hues (§1.1) ────────────────────────────
  for (const { value, index } of classAttrs(tpl.text, tpl.offset)) {
    const hit = RAW_HUE.exec(value)
    if (hit) {
      report(
        file,
        lineOf(src, index),
        'raw-palette-hue',
        '§1.1',
        `\`${hit[0].trim()}\` — use the semantic ramp (error-500, success-500 …), a \`.tint-*\` class, or a --gm-* token`
      )
    }
  }
  // …and in the `<script>` half, where colour maps used to hide.
  {
    const scriptEnd = tpl.offset > 0 ? tpl.offset : src.length
    const scriptHalf = src.slice(0, scriptEnd)
    const re =
      /'((?:text|bg|border|ring)-(?:amber|orange|yellow|red|green|lime|blue|neutral|gray|zinc|slate)-\d{2,3}[^']*)'/g
    let m
    while ((m = re.exec(scriptHalf))) {
      report(
        file,
        lineOf(src, m.index),
        'raw-palette-hue',
        '§1.1',
        `\`${m[1]}\` in script — map to a \`.tint-*\` class or a semantic ramp value instead`
      )
    }
  }

  // ── Rules 3 + 4: form-control width and size (§3.1, §3.2) ──────
  for (const { tag, attrs, index } of uiTags(tpl.text, tpl.offset)) {
    if (!FORM_CONTROLS.includes(tag)) continue
    if (/(?:^|\s)class="[^"]*\bw-full\b/.test(attrs)) {
      report(file, lineOf(src, index), 'redundant-w-full', '§3.1', `<${tag}> is already full width via app.config.ts`)
    }
    if (/(?:^|\s)size="/.test(attrs)) {
      // `size="sm"` is allowed only on the §3.4 intrinsic-width cluster controls,
      // which are the ones that also carry an explicit `w-*`.
      const hasExplicitWidth = /(?:^|\s)class="[^"]*\bw-(?:\d+|px|auto)\b/.test(attrs)
      if (!hasExplicitWidth) {
        report(
          file,
          lineOf(src, index),
          'form-control-size',
          '§3.2',
          `<${tag}> must not set \`size\` — all controls are md (app.config.ts)`
        )
      }
    }
  }

  // ── Rule 5: no size="xl" on buttons (§2) ───────────────────────
  for (const { tag, attrs, index } of uiTags(tpl.text, tpl.offset)) {
    if (tag === 'UButton' && /(?:^|\s)size="xl"/.test(attrs)) {
      report(
        file,
        lineOf(src, index),
        'button-size-xl',
        '§2',
        '`size="xl"` is not in the scale — the largest rank is `lg`'
      )
    }
  }

  // ── Rules 6 + 7: page shell owns width and padding (§4.2) ──────
  if (isPage && !SHELL_EXEMPT.includes(file)) {
    // The template root is the first tag after `<template>`.
    const rootMatch = /<template>\s*(<[A-Za-z][^\s/>]*)/.exec(tpl.text)
    const root = rootMatch?.[1]
    if (root && root !== '<CommonPageShell') {
      report(
        file,
        lineOf(src, tpl.offset),
        'missing-page-shell',
        '§4.2',
        `template root is \`${root}\`, expected \`<CommonPageShell>\` (add to SHELL_EXEMPT only with a documented reason)`
      )
    }
    // Layout classes on the root element itself.
    const rootTag = /<template>\s*<[A-Za-z][^>]*>/s.exec(tpl.text)?.[0] ?? ''
    const bad = /\b(max-w-(?!none\b)[a-z0-9]+|px-\d|py-\d)\b/.exec(rootTag)
    if (bad) {
      report(
        file,
        lineOf(src, tpl.offset),
        'page-root-layout-class',
        '§4.2',
        `\`${bad[0]}\` on the page root — <CommonPageShell> owns cap and gutters`
      )
    }
  }

  // ── Rule 8: retired hand-rolled link style (§1.5) ──────────────
  for (const { value, index } of classAttrs(tpl.text, tpl.offset)) {
    if (/text-primary-\d00\s+dark:text-primary-\d00/.test(value)) {
      report(file, lineOf(src, index), 'legacy-link-style', '§1.5', 'use `class="link"` for in-text links')
    }
  }

  // ── Rule 10: fixed brand shade as foreground / solid fill (§1.1) ─
  // `text-primary`/`bg-primary` read `--ui-primary`, which is 500 in light mode
  // and 400 in dark — the same variable a solid button's background reads. A fixed
  // shade matches buttons in one mode only. Alpha tints (`/10`, `/50`) are
  // deliberate and allowed: a wash is chosen against a shade.
  for (const { value, index } of classAttrs(tpl.text, tpl.offset)) {
    const hit = /(?:^|[\s'"`:])(?:text|bg)-primary-\d{2,3}\b(?!\/)/.exec(value)
    if (hit) {
      report(
        file,
        lineOf(src, index),
        'fixed-brand-shade',
        '§1.1',
        `\`${hit[0].trim()}\` — use the mode-aware \`text-primary\` / \`bg-primary\` (alpha tints like \`bg-primary-500/10\` are fine)`
      )
    }
  }

  // ── Rule 12: a badge must state its colour (§7) ─────────────────
  // Nuxt UI's own default is solid primary, and the global default cannot be
  // changed without restyling every nested badge in the library (§2.1).
  for (const { tag, attrs, index } of uiTags(tpl.text, tpl.offset)) {
    if (tag === 'UBadge' && !/(?:^|\s)(?::|v-bind:)?color=/.test(attrs)) {
      report(
        file,
        lineOf(src, index),
        'badge-missing-color',
        '§7',
        '<UBadge> without `color` renders solid primary — state `color="neutral"` (or the intended colour)'
      )
    }
  }

  // ── Rule 13: no decorative shadow on a button (§2) ─────────────
  for (const { tag, attrs, index } of uiTags(tpl.text, tpl.offset)) {
    if (tag === 'UButton' && /class="[^"]*\bshadow-(?:sm|md|lg|xl|2xl)\b/.test(attrs)) {
      report(
        file,
        lineOf(src, index),
        'button-decorative-shadow',
        '§2',
        'a shadow makes a solid button bloom past its box, so an identically-sized neighbour reads smaller'
      )
    }
  }
}

// ── Rule 11: forbidden defaultVariants in app.config (§2.1) ──────
// `useComponentProps` resolves these BEFORE a component's own prop defaults, and
// 44 Nuxt UI components render a nested UButton/UBadge that depend on those.
{
  const file = 'app/app.config.ts'
  let src
  try {
    src = readFileSync(join(ROOT, file), 'utf8')
  } catch {
    src = ''
  }
  for (const component of ['button', 'badge', 'card']) {
    // Match `button: { … defaultVariants` — a commented mention must not trip it.
    const re = new RegExp(`^\\s*${component}:\\s*\\{[\\s\\S]{0,400}?defaultVariants`, 'm')
    const hit = re.exec(src)
    if (hit) {
      report(
        file,
        lineOf(src, hit.index),
        'unsafe-default-variants',
        '§2.1',
        `\`${component}.defaultVariants\` overrides every Nuxt UI component that nests a U${
          component === 'badge' ? 'Badge' : component === 'card' ? 'Card' : 'Button'
        } (Modal close, Pagination, Tabs, Toast, ColorModeButton…). Pass props at the call site instead.`
      )
    }
  }
}

// ── Rule 9: the forbidden term, repo-wide (§10) ──────────────────
{
  const SCAN_DIRS = ['app', 'server', 'shared', 'i18n', 'scripts', 'tests']
  const TERM = /pull[\s_-]?request|pullRequest|\bPRs?\b/
  for (const dir of SCAN_DIRS) {
    let files
    try {
      files = walkAny(join(ROOT, dir))
    } catch {
      continue
    }
    for (const abs of files) {
      const file = relative(ROOT, abs).split(sep).join('/')
      // This file *defines* the prohibition, so it necessarily contains the term.
      if (file === 'scripts/design-check.mjs') continue
      const src = readFileSync(abs, 'utf8')
      src.split('\n').forEach((line, i) => {
        // `i-lucide-git-pull-request` is Lucide's icon name, not our terminology.
        // A line may opt out with `design-check-ignore` — used where the comment
        // is itself stating the rule.
        if (line.includes('design-check-ignore')) return
        const stripped = line.replace(/i-lucide-git-pull-request/g, '')
        const hit = TERM.exec(stripped)
        if (hit) {
          report(file, i + 1, 'forbidden-term', '§10', `"${hit[0]}" — the project term is "GourMerge Request"`)
        }
      })
    }
  }
}

function walkAny(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walkAny(p, out)
    else if (/\.(vue|ts|mjs|json)$/.test(p)) out.push(p)
  }
  return out
}

// ── Report ───────────────────────────────────────────────────────
if (findings.length === 0) {
  console.log('✓ design:check — no design-book violations')
  process.exit(0)
}

const byRule = new Map()
for (const f of findings) {
  if (!byRule.has(f.rule)) byRule.set(f.rule, [])
  byRule.get(f.rule).push(f)
}

console.error(`\n✗ design:check — ${findings.length} violation(s) of DESIGNBOOK.md\n`)
for (const [rule, list] of [...byRule.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.error(`  ${rule}  (${list[0].section})  ×${list.length}`)
  for (const f of list) console.error(`    ${f.file}:${f.line}  ${f.message}`)
  console.error('')
}
console.error('Fix centrally (app.config.ts / main.css) where possible — see DESIGNBOOK.md §12.\n')
process.exit(1)
