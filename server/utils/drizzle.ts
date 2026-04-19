/**
 * useDrizzle — Auto-imported server utility
 *
 * Wraps useDatabase() as useDrizzle() for consistency with
 * nuxt-auth-utils naming conventions (useUserSession, etc.)
 */
import { useDatabase } from '~~/server/database'

export function useDrizzle() {
  return useDatabase()
}
