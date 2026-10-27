/**
 * The agent skill advertised by `/.well-known/ai-catalog.json` — see
 * `server/utils/agentCatalog.ts` for what it is and why it exists.
 */
export default defineEventHandler((event) => {
  const appUrl = useRuntimeConfig(event).public.appUrl

  setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=86400')

  return buildAgentSkill(appUrl)
})
