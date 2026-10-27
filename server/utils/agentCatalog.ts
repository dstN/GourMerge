/**
 * What this site tells AI agents about itself — the Agentic Resource Discovery (ARD) catalog
 * at `/.well-known/ai-catalog.json` and the agent skill it points at.
 *
 * ## Why a catalog at all
 *
 * Lighthouse's `agentic-browsing` category counts four audits in a browser without WebMCP:
 * the accessibility tree, CLS, `llms.txt` and `ard-schema`. The last one is *not applicable*
 * when the catalog URL answers 404 — and it scored 0 here, because it did not. The
 * `[username]/[slug]` page caught `/.well-known/ai-catalog.json` as a recipe path and answered
 * **200 with the "recipe not found" page**, so the audit saw a catalog that exists and is not
 * JSON. Two fixes, both needed: `.well-known` is now a reserved prefix in
 * `validate-recipe-route.ts` (a real 404 for everything else under it), and this catalog makes
 * the audit pass instead of merely stepping aside.
 *
 * ## What is in it
 *
 * One entry, and it is honest about what it is: a markdown skill (`urn:air:agent-skills`
 * profile) that tells an agent how to browse this site — the URL shapes, the Recipe JSON-LD,
 * the locales, the one name for a merge proposal. There is no MCP server and no agent card,
 * so none is advertised; the validator warns on non-standard media types, and inventing an
 * "agent" to satisfy it would be the wrong kind of green.
 *
 * ## Discovery
 *
 * By the well-known path alone. The ARD spec also allows an `Agentmap:` line in `robots.txt`
 * and a `<link rel="ai-catalog">`; the first was tried and withdrawn, because Lighthouse's own
 * `robots-txt` audit does not know the directive and fails SEO with "Unknown directive" — one
 * category traded for another. The `ard-schema` gatherer falls back to
 * `/.well-known/ai-catalog.json` when no explicit signal exists, which is where this lives.
 *
 * ## Why these are pure functions
 *
 * Same reason `robots.txt` and `llms.txt` are routes: the links have to be absolute and the
 * host is only known at runtime. Building the documents here, from an `appUrl` argument, is
 * what lets `tests/unit/agentCatalog.test.ts` pin the spec's invariants (the URN pattern,
 * exactly one of `url`/`data`, 2–5 representative queries) without an HTTP server.
 */

export const AI_CATALOG_PATH = '/.well-known/ai-catalog.json'
export const AGENT_SKILL_PATH = '/.well-known/skills/gourmerge/SKILL.md'

export interface AiCatalogEntry {
  identifier: string
  displayName: string
  type: string
  url: string
  description: string
  tags: string[]
  capabilities: string[]
  representativeQueries: string[]
}

export interface AiCatalog {
  specVersion: '1.0'
  host: { displayName: string; documentationUrl: string }
  entries: AiCatalogEntry[]
}

const trimSlash = (url: string) => url.replace(/\/$/, '')

export function buildAiCatalog(appUrl: string): AiCatalog {
  const base = trimSlash(appUrl)
  return {
    specVersion: '1.0',
    host: {
      displayName: 'GourMerge',
      documentationUrl: `${base}/llms.txt`,
    },
    entries: [
      {
        // RFC 8141 URN, `urn:air:<publisher>:<namespace>:<name>`. The publisher is the
        // production domain by design — a URN is a logical name, not a locator, so it must not
        // follow `appUrl` to `localhost` on a developer machine.
        identifier: 'urn:air:gourmerge.de:site:browsing-skill',
        displayName: 'Browsing GourMerge',
        type: 'text/markdown; profile="urn:air:agent-skills"',
        url: `${base}${AGENT_SKILL_PATH}`,
        description:
          'How to read and navigate GourMerge, a recipe platform built on the git model: ' +
          'URL shapes, the Recipe JSON-LD on every recipe page, the four locales, and the terms ' +
          '(fork, branch, commit, GourMerge Request) as they are used here.',
        tags: ['recipes', 'cooking', 'git', 'nutrition', 'multilingual'],
        capabilities: ['BrowsePublicRecipes', 'ReadRecipeStructuredData', 'ExplainGourMergeTerms'],
        representativeQueries: [
          'Find a public recipe on GourMerge',
          'What is a GourMerge Request?',
          'How do forks and branches work for recipes?',
          'Read the ingredients and nutrition of a GourMerge recipe',
        ],
      },
    ],
  }
}

/**
 * The skill itself — agentskills.io layout: YAML front matter with `name` and `description`,
 * then the instructions. English only, like `llms.txt`, and for the same reason: it is not
 * user-facing copy, so there is no i18n parity to keep.
 */
export function buildAgentSkill(appUrl: string): string {
  const base = trimSlash(appUrl)
  return `---
name: browsing-gourmerge
description: How to read and navigate GourMerge, a recipe platform built on the git model. Use when asked to find, read or explain a recipe on ${base}, or when the terms fork, branch, commit or GourMerge Request come up in a cooking context.
---

# Browsing GourMerge

GourMerge is a recipe platform that borrows git's model: recipes are forked, branched,
committed and merged, so a variation keeps its lineage. It is text by design — there are no
recipe photos to look at, so read the structured data, not screenshots.

## URL shapes

- \`${base}/explore\` — public recipes, the entry point for browsing.
- \`${base}/<username>/<slug>\` — one recipe. Append \`?branch=<name>\` for a variant.
- \`${base}/<username>\` — a public profile with that cook's recipes.
- \`${base}/help/glossary\` — the git terms as used here, with their cooking aliases.
- \`${base}/sitemap.xml\` — every public page.

German is the default and lives at the root; \`/en\`, \`/fr\` and \`/it\` prefix the other
three locales (\`${base}/en/explore\`). Every locale is at full parity, so pick the reader's
language rather than translating German yourself.

## Reading a recipe

1. Prefer the Recipe JSON-LD in the page head (\`application/ld+json\`, \`@type: Recipe\`) over
   scraping the rendered ingredient list: it carries ingredients, instructions, servings and
   nutrition in a stable shape.
2. Quantities are stored metric; the page may display the viewer's unit preference.
3. Nutrition comes from the Swiss BLV and German BLS reference databases via a shared
   ingredient table, so values are comparable across recipes.

## Vocabulary — use these words

- **Fork**: a copy of someone else's recipe under your own account, linked to its origin.
- **Branch** (German: Variante): a parallel version of your own recipe — a vegan take, a
  smaller batch.
- **Commit**: one saved change to ingredients or steps, with a message.
- **GourMerge Request**: a proposal to merge one branch into another, showing the diff. This
  is the only name for it on this site; do not substitute the term other git platforms use.

## Limits

- \`/api/\` is not a public API and is disallowed in \`robots.txt\`; use the HTML pages and
  their JSON-LD.
- Private recipes answer 404 to anyone but their owner. Signing in, writing or rating on a
  user's behalf is out of scope for this skill.
- Short site summary for agents: \`${base}/llms.txt\`.
`
}
