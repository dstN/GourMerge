// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import eslintConfigPrettier from 'eslint-config-prettier'

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
      // Prettier owns element formatting; this rule conflicts with how Prettier
      // self-closes void elements (<input />), so leave it to Prettier.
      'vue/html-self-closing': 'off',
      /**
       * `click:` as an object property is the Nuxt UI **v3** menu-item API.
       *
       * v4 reads `onSelect`, and an unknown key on an item is not an error — it is simply
       * never looked at. So the entry renders, looks right, and does nothing when clicked.
       * That is how signing out became impossible from the desktop header, and how both
       * entries in the help menu became decorative, for as long as this app has been on v4.
       *
       * Nothing else caught it. Typecheck stays quiet because `DropdownMenuItem` extends
       * `LinkProps`, which pulls in Vue's HTML attribute types — verified by reintroducing
       * `click:` on an array explicitly annotated as `DropdownMenuItem[][]` and watching
       * `nuxt typecheck` pass. A lint rule is the only thing here that actually fails.
       *
       * `@click` in a template is unaffected: that is a directive, not a property.
       */
      'no-restricted-syntax': [
        'error',
        {
          selector: "Property[key.name='click'][value.type!='Literal']",
          message:
            'Nuxt UI v4 menu items use `onSelect`, not `click`. A `click` key is silently ignored, so the item renders and does nothing.',
        },
      ],
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
  }
  // eslint-config-prettier last: turn off all formatting rules Prettier owns.
).append(eslintConfigPrettier)
