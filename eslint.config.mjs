// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    rules: {
      // Enforce Composition API only (no Options API, no defineNuxtComponent)
      'vue/component-api-style': ['error', ['script-setup']],
      // Disallow console.log in production code (use the structured logger)
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      // Allow 'any' with justification — we use it in Drizzle query results and dynamic handlers.
      // Prefer explicit types where possible but don't hard-block on every any.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // Scripts (maintenance + CI utilities) intentionally use console.log
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // Test files can use any freely for mock data and assertions
  {
    files: ['tests/**/*.ts', 'tests/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
