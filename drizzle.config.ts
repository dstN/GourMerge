import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './server/database/schema.ts',
  out: './server/database/migrations',
  dialect: 'mysql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'mysql://gourmerge:gourmerge_secret@localhost:3306/gourmerge',
  },
  // Use `db:generate` + `db:migrate` for all schema changes.
  // `db:push` is for local throwaway dev only — never run against production.
})
