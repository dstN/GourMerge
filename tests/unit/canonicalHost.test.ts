import { describe, test, expect } from 'vitest'
import { canonicalRedirect } from '../../server/utils/canonicalHost'

/**
 * The canonical-host rule is narrow by design, and the tests exist mostly to pin the
 * things it must NOT do — a redirect loop here would take the whole site down, and
 * redirecting an ACME challenge would silently stop certificate renewal.
 */
describe('canonicalRedirect', () => {
  test('redirects www to the apex over https, preserving the path', () => {
    expect(canonicalRedirect('www.gourmerge.de', '/recipes/new', 'GET')).toEqual({
      status: 301,
      location: 'https://gourmerge.de/recipes/new',
    })
  })

  test('preserves the query string, which the task URLs depend on', () => {
    // `/tasks/retention?key=…` — losing the query would turn a working cron into a 401.
    expect(canonicalRedirect('www.gourmerge.de', '/tasks/retention?key=abc&dryRun=1', 'GET')?.location).toBe(
      'https://gourmerge.de/tasks/retention?key=abc&dryRun=1'
    )
  })

  test('uses 308 for non-idempotent methods so the body and method survive', () => {
    // A 301 on POST lets clients downgrade to GET, which would silently discard a
    // form submission instead of completing it on the canonical host.
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(canonicalRedirect('www.gourmerge.de', '/auth/login', method)?.status, method).toBe(308)
    }
    expect(canonicalRedirect('www.gourmerge.de', '/', 'HEAD')?.status).toBe(301)
  })

  test('is case-insensitive about the prefix', () => {
    expect(canonicalRedirect('WWW.gourmerge.de', '/', 'GET')?.location).toBe('https://gourmerge.de/')
  })

  test('leaves the apex alone — this is what makes a loop impossible', () => {
    expect(canonicalRedirect('gourmerge.de', '/recipes/new', 'GET')).toBeNull()
  })

  test('does not touch the redirect target it would produce', () => {
    // The result of a redirect must never itself redirect.
    const first = canonicalRedirect('www.gourmerge.de', '/x', 'GET')!
    const host = new URL(first.location).host
    expect(canonicalRedirect(host, '/x', 'GET')).toBeNull()
  })

  test('never redirects ACME challenges, on either host', () => {
    const path = '/.well-known/acme-challenge/TOKEN'
    expect(canonicalRedirect('www.gourmerge.de', path, 'GET')).toBeNull()
    expect(canonicalRedirect('gourmerge.de', path, 'GET')).toBeNull()
  })

  test('ignores a missing Host header instead of throwing', () => {
    expect(canonicalRedirect(undefined, '/', 'GET')).toBeNull()
    expect(canonicalRedirect('', '/', 'GET')).toBeNull()
  })

  test.each([
    ['www.', 'a bare prefix with nothing after it'],
    ['www.localhost', 'no dot in the remainder'],
  ])('refuses to build a redirect from %s (%s)', (host) => {
    // `https://` + empty host would be a protocol-relative URL pointing at the path.
    expect(canonicalRedirect(host, '/x', 'GET')).toBeNull()
  })

  test('does not match a host that merely contains www', () => {
    expect(canonicalRedirect('wwwgourmerge.de', '/', 'GET')).toBeNull()
    expect(canonicalRedirect('notwww.gourmerge.de', '/', 'GET')).toBeNull()
  })

  test('handles a deeper subdomain under www', () => {
    // Not expected in production, but it must strip exactly one leading label.
    expect(canonicalRedirect('www.staging.gourmerge.de', '/', 'GET')?.location).toBe('https://staging.gourmerge.de/')
  })
})
