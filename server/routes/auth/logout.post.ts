/**
 * POST /auth/logout — Clear the user session
 */
export default defineEventHandler(async (event) => {
  await clearUserSession(event)
  return { success: true }
})
