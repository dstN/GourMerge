/**
 * GourMerge — Auth Session Type Augmentation
 *
 * Extends nuxt-auth-utils session types with our domain-specific user shape.
 * This allows `useUserSession().user` to be fully typed throughout the app.
 */
declare module '#auth-utils' {
  interface User {
    id: number
    username: string
    displayName: string | null
    email: string
    avatarUrl: string | null
  }

  interface UserSession {
    loggedInAt: string
  }

  interface SecureSessionData {
    /** Internal user ID for server-side lookups */
    userId: number
  }
}

export {}
