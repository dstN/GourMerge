/**
 * Drizzle Kit Configuration
 *
 * Used by `npx drizzle-kit push` to push schema changes to MariaDB.
 */
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './server/database/schema.ts',
  out: './server/database/migrations',
  dialect: 'mysql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'mysql://gourmerge:gourmerge_secret@localhost:3306/gourmerge',
  },
})
