import { describe, test, expect } from 'vitest'
import { renderMarkdownSafe } from '../../app/utils/markdown'

describe('renderMarkdownSafe', () => {
  test('empty input returns empty string', () => {
    expect(renderMarkdownSafe('')).toBe('')
  })

  test('renders Markdown bold to <strong>', () => {
    expect(renderMarkdownSafe('**bold**')).toContain('<strong>bold</strong>')
  })

  test('renders Markdown lists', () => {
    const html = renderMarkdownSafe('- a\n- b')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>a</li>')
  })

  test('passes through already-HTML TipTap output', () => {
    const html = renderMarkdownSafe('<p>Mix <em>well</em></p>')
    expect(html).toContain('<em>well</em>')
  })

  // ── XSS hardening (the reason this util exists) ──────────────────

  test('strips <script> tags', () => {
    const html = renderMarkdownSafe('<p>hi</p><script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('alert(1)')
  })

  test('strips inline event handlers and disallowed img tag', () => {
    const html = renderMarkdownSafe('<img src="x" onerror="alert(1)">')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('<img')
  })

  test('strips javascript: hrefs from links', () => {
    const html = renderMarkdownSafe('<a href="javascript:alert(1)">click</a>')
    expect(html).not.toContain('javascript:')
  })

  test('keeps safe external links and marks them noopener/nofollow', () => {
    const html = renderMarkdownSafe('<a href="https://example.com">link</a>')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
  })

  test('script injected via Markdown raw HTML is removed', () => {
    const html = renderMarkdownSafe('Tasty <script>steal()</script> cake')
    expect(html).not.toContain('<script>')
    expect(html).toContain('Tasty')
  })
})
