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
  transformTags: {
    // A relative href (our own `/username` mention links, or any future internal link) is
    // left alone — same-tab, no `nofollow`, matching every other internal navigation in the
    // app. Anything else (http/https/mailto, i.e. genuinely external) keeps the forced
    // safe/non-referring transform. Checked on the href actually present, since a custom
    // sanitize-html transform is the only way to make this conditional per link —
    // `simpleTransform` applies unconditionally to every `<a>`.
    a: (tagName, attribs) => {
      if (attribs.href?.startsWith('/')) return { tagName, attribs }
      return { tagName, attribs: { ...attribs, rel: 'noopener noreferrer nofollow', target: '_blank' } }
    },
  },
}

/**
 * Username charset matches `register.post.ts`'s own validation. Excludes a mention
 * whose `@` is preceded by a word character or another `@`, so `user@example.com` is not
 * read as a mention of `example`.
 */
const MENTION_PATTERN = /(?:^|[^\w@])@([a-zA-Z0-9_-]{1,50})/g

/**
 * Turn `@username` into a Markdown link before `marked.parse()` runs, so it flows through
 * the exact same sanitize path as any other link — no HTML is ever pre-injected into the
 * stored body. Split on fenced/inline code first so a literal `@decorator` inside a pasted
 * code sample is never linkified.
 */
export function linkifyMentions(markdown: string): string {
  const segments = markdown.split(/(```[\s\S]*?```|`[^`]*`)/)
  return segments
    .map((segment, i) => {
      // Odd indices are the code spans captured by the split's own capture group.
      if (i % 2 === 1) return segment
      return segment.replace(MENTION_PATTERN, (match, username: string) => {
        const prefix = match.slice(0, match.length - username.length - 1)
        return `${prefix}[@${username}](/${username})`
      })
    })
    .join('')
}

/**
 * Render user Markdown/HTML to sanitized HTML safe for `v-html`.
 * Returns an empty string for empty input.
 */
export function renderMarkdownSafe(content: string): string {
  if (!content) return ''
  // New saves already store HTML (TipTap getHTML); legacy saves store Markdown. Mentions
  // are linkified only on the Markdown branch — rewriting text nodes inside already-generated
  // HTML without a real parser is much higher risk for a discussion-only feature.
  const isHtml = content.trimStart().startsWith('<')
  const html = isHtml ? content : (marked.parse(linkifyMentions(content), { async: false }) as string)
  return sanitizeHtml(html, SANITIZE_OPTIONS)
}
