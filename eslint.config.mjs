// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    rules: {
      // Enforce Composition API only (no Options API, no defineNuxtComponent)
      'vue/component-api-style': ['error', ['script-setup']],
      // Disallow console.log in production code (use the structured logger)
      'no-console': ['warn', { allow: ['error', 'warn'] }],
    },
  }
)
