/**
 * Shared token resolution for the GDPR self-service endpoints.
 *
 * Every one of them starts the same way — hash the raw token, look it up,
 * reject expired/completed rows — and getting any of those checks wrong in one
 * place is how a download link outlives its window.
 */
import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { dataRequests, users } from '~~/server/database/schema'

export interface ResolvedRequest {
  id: number
  userId: number
  type: 'export' | 'deletion'
  confirmedAt: Date | null
  email: string
  username: string
  preferredLocale: string
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/**
 * Resolve a raw token to its request, or throw 400.
 *
 * Uses one generic message for every failure mode — unknown, expired, already
 * completed. Distinguishing them would tell an attacker holding a guessed token
 * whether it ever existed.
 */
export async function resolveDataRequest(
  db: NonNullable<ReturnType<typeof useDrizzle>>,
  rawToken: string,
  expectedType?: 'export' | 'deletion'
): Promise<ResolvedRequest> {
  const invalid = () => createError({ statusCode: 400, statusMessage: 'This link is invalid or has expired.' })

  if (!rawToken || rawToken.length < 32) throw invalid()

  const [row] = await db
    .select({
      id: dataRequests.id,
      userId: dataRequests.userId,
      type: dataRequests.type,
      expiresAt: dataRequests.expiresAt,
      confirmedAt: dataRequests.confirmedAt,
      completedAt: dataRequests.completedAt,
      email: users.email,
      username: users.username,
      preferredLocale: users.preferredLocale,
      anonymizedAt: users.anonymizedAt,
    })
    .from(dataRequests)
    .innerJoin(users, eq(users.id, dataRequests.userId))
    .where(eq(dataRequests.tokenHash, hashToken(rawToken)))
    .limit(1)

  if (!row) throw invalid()
  if (row.completedAt) throw invalid()
  if (new Date(row.expiresAt).getTime() < Date.now()) throw invalid()
  // An account erased through another route must not keep serving exports.
  if (row.anonymizedAt) throw invalid()
  if (expectedType && row.type !== expectedType) throw invalid()

  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    confirmedAt: row.confirmedAt ? new Date(row.confirmedAt) : null,
    email: row.email,
    username: row.username,
    preferredLocale: row.preferredLocale,
  }
}
