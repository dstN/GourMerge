/**
 * Safe Markdown / rich-text rendering for user-generated recipe content.
 *
 * Recipe step content is stored either as TipTap HTML (new saves) or as raw
 * Markdown (legacy saves). Both are user-controlled, so the rendered HTML MUST
 * be sanitized before it is injected via `v-html` — the app CSP allows
 * `script-src 'unsafe-inline'`, so an unsanitized `<img onerror>` / `<script>`
 * in a step would execute (stored XSS). See ARCHITECTURE.md §8 + §12.
 *
 * Sanitizing at render time (rather than on write) covers every data path to
 * the sink and every legacy row, and leaves the stored content untouched so the
 * diff engine keeps comparing raw strings.
 */
import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'

// Matches the TipTap StarterKit output surface (text-only product, no images).
const ALLOWED_TAGS = [
  'p',
  'br',
  'span',
  'strong',
  'em',
  'b',
  'i',
  'u',
  's',
  'del',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'code',
  'pre',
  'hr',
  'a',
]

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: { a: ['href', 'title', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  // Force external links to be safe and non-referring.
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }),
  },
}

/**
 * Render user Markdown/HTML to sanitized HTML safe for `v-html`.
 * Returns an empty string for empty input.
 */
export function renderMarkdownSafe(content: string): string {
  if (!content) return ''
  // New saves already store HTML (TipTap getHTML); legacy saves store Markdown.
  const html = content.trimStart().startsWith('<') ? content : (marked.parse(content, { async: false }) as string)
  return sanitizeHtml(html, SANITIZE_OPTIONS)
}
