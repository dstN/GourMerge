import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The stray-space bug that took production down: `LOG_LEVEL="info "` made `pino()` throw
 * `default level:info  must be included in custom levels`, and because the logger is built
 * lazily on first use — often inside `logger.error()` — the process died while reporting an
 * error. Passenger returned "Incomplete response received from application" and the browser a
 * 502. These cases assert the resolver never throws and never returns a level pino rejects.
 */
const PINO_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']

async function resolve(value: string | undefined, fallback = 'info') {
  vi.resetModules()
  if (value === undefined) delete process.env.LOG_LEVEL
  else process.env.LOG_LEVEL = value
  const mod = await import('../../server/utils/logger')
  // Exercised through the public surface: getLogger() would open a rotating file stream, so
  // the level decision is asserted via the exported resolver.
  return (mod as unknown as { resolveLevel?: (f: string) => string }).resolveLevel?.(fallback)
}

describe('LOG_LEVEL resolution', () => {
  const original = process.env.LOG_LEVEL
  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}))
  afterEach(() => {
    if (original === undefined) delete process.env.LOG_LEVEL
    else process.env.LOG_LEVEL = original
    vi.restoreAllMocks()
  })

  it.each([
    ['info ', 'info'],
    [' debug', 'debug'],
    ['INFO', 'info'],
    ['\tWARN\n', 'warn'],
    ['info', 'info'],
  ])('normalises %j to %j', async (input, expected) => {
    expect(await resolve(input)).toBe(expected)
  })

  it.each(['verbose', 'nonsense', '', '  '])('falls back for %j instead of throwing', async (input) => {
    const out = await resolve(input, 'info')
    expect(out).toBe('info')
    expect(PINO_LEVELS).toContain(out)
  })

  it('uses the caller fallback when LOG_LEVEL is unset', async () => {
    expect(await resolve(undefined, 'debug')).toBe('debug')
  })
})
