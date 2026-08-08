/**
 * Swaps the tab title to a random "still cooking" message from `app.inactiveTitles` while
 * the tab is hidden, restoring the real title on return.
 */
export default defineNuxtPlugin((nuxtApp) => {
  // `nuxtApp.$i18n`, not `useI18n()` — same reason as zod-locale.client.ts: a plugin body
  // is not a component setup function.
  const i18n = nuxtApp.$i18n as { tm: (key: string) => unknown; rt: (message: unknown) => string }

  function inactiveTitles(): string[] {
    const raw = i18n.tm('app.inactiveTitles')
    // tm() preserves array/object structure but leaf values come back as compiled message
    // functions, not plain strings — rt() resolves each one to its final text.
    return Array.isArray(raw) ? raw.map((v) => i18n.rt(v)).filter((v): v is string => typeof v === 'string') : []
  }

  let savedTitle: string | null = null

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      const pool = inactiveTitles()
      if (!pool.length) return
      savedTitle = document.title
      document.title = pool[Math.floor(Math.random() * pool.length)] as string
    } else if (savedTitle) {
      document.title = savedTitle
      savedTitle = null
    }
  })
})
