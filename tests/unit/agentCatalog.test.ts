import { describe, test, expect } from 'vitest'
import { buildAiCatalog, buildAgentSkill, AI_CATALOG_PATH, AGENT_SKILL_PATH } from '../../server/utils/agentCatalog'

/**
 * Pins the ARD 1.0 invariants Lighthouse's `ard-schema` audit checks (a port of the spec's
 * conformance tester). Each one that fails turns the catalog from "valid" into a scored 0 —
 * worse than not having one — so they are asserted here rather than discovered in a report.
 */
describe('buildAiCatalog', () => {
  const catalog = buildAiCatalog('https://gourmerge.de/')

  test('is spec version 1.0 with a host and at least one entry', () => {
    expect(catalog.specVersion).toBe('1.0')
    expect(catalog.host.displayName).toBe('GourMerge')
    expect(catalog.entries.length).toBeGreaterThan(0)
  })

  test('every entry satisfies the schema: URN identifier, one of url/data, 2–5 queries', () => {
    const URN = /^urn:air:([a-zA-Z0-9.-]+)(?::([a-zA-Z0-9._:-]+))?:([a-zA-Z0-9._-]+)$/
    for (const entry of catalog.entries) {
      expect(entry.identifier).toMatch(URN)
      expect(entry.displayName).toBeTruthy()
      expect(entry.type).toBeTruthy()
      expect('url' in entry).toBe(true)
      expect('data' in entry).toBe(false)
      expect(entry.representativeQueries.length).toBeGreaterThanOrEqual(2)
      expect(entry.representativeQueries.length).toBeLessThanOrEqual(5)
      for (const q of entry.representativeQueries) expect(typeof q).toBe('string')
    }
  })

  test('uses only standard discovery media types, so the validator emits no warning', () => {
    const standard = [
      'application/ai-catalog+json',
      'application/agent-card+json',
      'application/a2a-agent-card+json',
      'application/mcp-server-card+json',
      'application/agent-skills+zip',
      'application/agent-skills+gzip',
      'text/markdown; profile="urn:air:agent-skills"',
      'application/ai-registry',
      'application/ai-registry+json',
    ]
    for (const entry of catalog.entries) expect(standard).toContain(entry.type)
  })

  test('links are absolute on the given host, without a doubled slash', () => {
    expect(catalog.host.documentationUrl).toBe('https://gourmerge.de/llms.txt')
    expect(catalog.entries[0]?.url).toBe(`https://gourmerge.de${AGENT_SKILL_PATH}`)
    expect(AI_CATALOG_PATH).toBe('/.well-known/ai-catalog.json')
  })

  test('the identifier does not follow appUrl to localhost', () => {
    expect(buildAiCatalog('http://localhost:3000').entries[0]?.identifier).toContain('gourmerge.de')
  })

  test('has no top-level collections (removed in ADR-0003)', () => {
    expect('collections' in catalog).toBe(false)
  })
})

describe('buildAgentSkill', () => {
  const skill = buildAgentSkill('http://localhost:3000')

  test('starts with YAML front matter carrying name and description', () => {
    const match = /^---\n([\s\S]*?)\n---\n/.exec(skill)
    expect(match).not.toBeNull()
    expect(match?.[1]).toMatch(/^name: [a-z0-9-]+$/m)
    expect(match?.[1]).toMatch(/^description: .+$/m)
  })

  test('links point at the runtime host and name the merge proposal the GourMerge way', () => {
    // The forbidden synonym itself is policed repo-wide by `npm run design:check` (§10).
    expect(skill).toContain('http://localhost:3000/explore')
    expect(skill).toContain('GourMerge Request')
  })
})
