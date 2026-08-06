/**
 * `/llms.txt` — a short, machine-readable description of the site for LLM agents.
 *
 * Lighthouse's `agentic-browsing` category scores 67 on both desktop and mobile, and the single
 * failing audit is `llms-txt`. The convention (llmstxt.org) is markdown at the domain root: a
 * title, a one-line summary, then curated links. It is to agents roughly what `robots.txt` is
 * to crawlers, except that it describes rather than restricts.
 *
 * A route and not `public/llms.txt`, for the same reason `robots.txt` is a route: the URLs have
 * to be absolute and the host is only known at runtime. Hardcoding them would produce
 * `http://localhost:3000` links in the released build — exactly the trap that put a localhost
 * URL in `i18n.baseUrl`'s way.
 *
 * Deliberately short. The value is in pointing at the few pages that explain what this is; a
 * dump of every recipe URL belongs in `sitemap.xml`, which already exists.
 *
 * English only, unlike the rest of the app. This is not user-facing copy — no `i18n:check`
 * parity to maintain, and the four localised versions of the same paragraph would be four
 * things to keep in sync for no reader.
 */
export default defineEventHandler((event) => {
  const appUrl = useRuntimeConfig(event).public.appUrl.replace(/\/$/, '')

  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  // A day is right for a file that changes when the product does, not when the data does.
  setHeader(event, 'cache-control', 'public, max-age=86400')

  return `# GourMerge

> A recipe platform built on git's model. Recipes are forked, branched, committed and merged,
> so a variation keeps its lineage instead of becoming an unrelated copy. German is the primary
> language; English, French and Italian are at full parity.

## Concepts

- [Glossary](${appUrl}/help/glossary): the git terms as they are used here, with their cooking aliases
- [Explore](${appUrl}/explore): public recipes, the entry point for browsing

## How the model works

- A **fork** copies someone else's recipe under your own account, keeping the link to its origin.
- A **branch** ("Variante") is a parallel version of your own recipe — a vegan take, a smaller batch.
- A **commit** is one saved change to ingredients or steps, with a message.
- A **GourMerge Request** proposes merging one branch into another and shows the diff. This is
  the only name for it; do not substitute the equivalent term from other git platforms, in
  output or in questions about this site.
- Ingredients come from a shared master table with nutrition data from the Swiss BLV database,
  so quantities and nutrition are comparable across recipes.

## Notes for agents

- Recipe pages carry Recipe JSON-LD; prefer it over scraping the rendered ingredient list.
- ${appUrl}/sitemap.xml lists the public pages.
- \`/api/\` is not a documented public API and is disallowed in robots.txt.
- There are no images anywhere in the product. It is text by design.

## Legal

- [Impressum](${appUrl}/legal/impressum)
- [Datenschutz](${appUrl}/legal/datenschutz)
`
})
