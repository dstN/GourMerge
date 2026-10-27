/**
 * `/.well-known/ai-catalog.json` — the Agentic Resource Discovery catalog.
 *
 * Content and rationale live in `server/utils/agentCatalog.ts`. A route rather than a file in
 * `public/` because the entry URL has to be absolute and the host is only known at runtime.
 * Discovery is by this well-known path alone — see the util for why `robots.txt` does not name it.
 */
export default defineEventHandler((event) => {
  const appUrl = useRuntimeConfig(event).public.appUrl

  setHeader(event, 'content-type', 'application/json; charset=utf-8')
  // Same horizon as llms.txt: this changes with the product, not with the data.
  setHeader(event, 'cache-control', 'public, max-age=86400')

  return JSON.stringify(buildAiCatalog(appUrl), null, 2)
})
