import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['server/utils/**', 'app/composables/**', 'app/utils/**', 'shared/**'],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 70,
      },
    },
    include: ['tests/unit/**/*.{test,spec}.{ts,js}', 'tests/component/**/*.{test,spec}.{ts,js}'],
    exclude: ['tests/e2e/**'],
  },
})
