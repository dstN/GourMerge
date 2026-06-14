import { uuidv7 } from 'uuidv7'

/**
 * Generate a new UUIDv7 as a 16-byte Buffer for BINARY(16) columns.
 *
 * UUIDv7 stores a 48-bit Unix-ms timestamp in its leading bytes,
 * keeping the secondary index dense and insert-cheap — unlike UUIDv4
 * which causes constant page splits (see ARCHITECTURE §5 / ROADMAP decision).
 *
 * Use for: recipes.publicId, gourmergeRequests.publicId
 * Do NOT use for: security tokens (verification/reset) — those must be CSPRNG.
 */
export function generatePublicId(): Buffer {
  const uuid = uuidv7() // e.g. "019682ab-1234-7xxx-xxxx-xxxxxxxxxxxx"
  return Buffer.from(uuid.replace(/-/g, ''), 'hex')
}

/** Convert a BINARY(16) Buffer back to a canonical UUID string for API responses. */
export function bufferToUuid(buf: Buffer): string {
  const hex = buf.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Parse a UUID string from a URL param into a BINARY(16) Buffer for DB queries. */
export function uuidToBuffer(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex')
}
