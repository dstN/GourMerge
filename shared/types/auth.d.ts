// Extends nuxt-auth-utils session types with our user shape, so useUserSession().user is
// fully typed throughout the app.
declare module '#auth-utils' {
  interface User {
    id: number
    username: string
    displayName: string | null
    email: string
    avatarUrl: string | null
    /**
     * Cached copy of `users.email_verified_at != NULL`, for display only — it drives
     * the unverified banner without costing a request per page. Never a security
     * boundary: `requireVerifiedUser` re-reads the column on every gated action.
     */
    emailVerified: boolean
  }

  interface UserSession {
    loggedInAt: string
    /**
     * Whether unverified accounts are actually restricted (`REQUIRE_EMAIL_VERIFICATION`).
     * Stamped at login because the flag is a server-side env var and, per the note above
     * `runtimeConfig` in nuxt.config, cannot be surfaced to the client build-time.
     */
    emailVerificationRequired: boolean
  }

  interface SecureSessionData {
    /** Internal user ID for server-side lookups */
    userId: number
  }
}

export {}
