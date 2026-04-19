/**
 * GourMerge — App Configuration
 *
 * Maps our custom brand colors (defined in main.css @theme) to
 * Nuxt UI's semantic color system. Without this, Nuxt UI v4 falls
 * back to its default green/emerald primary — which is why CTAs
 * were green instead of our saffron/amber.
 */
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'primary',
      secondary: 'secondary',
      neutral: 'slate',
    },
  },
})
