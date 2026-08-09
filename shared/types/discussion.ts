/**
 * Recipe discussions — the thread shape shared by the API and the UI.
 *
 * A thread anchored to a commit (`commitId !== null`) and one anchored to the recipe
 * carry exactly the same fields on purpose; only where they are listed differs. See the
 * `recipe_discussions` comment in the schema for why that is one table and not two.
 */

export type DiscussionCategory = 'idea' | 'question' | 'issue' | 'praise'
export type DiscussionStatus = 'open' | 'resolved'

export interface DiscussionAuthor {
  authorId: number
  authorUsername: string
  authorDisplayName: string | null
  authorAvatarUrl: string | null
}

export interface RecipeDiscussionComment extends DiscussionAuthor {
  id: number
  discussionId: number
  /** Markdown. Sanitized at render time, never on write. */
  body: string
  createdAt: string
}

export interface RecipeDiscussion extends DiscussionAuthor {
  id: number
  /** NULL for a thread about the recipe; a commit id for a thread about one snapshot. */
  commitId: number | null
  title: string
  /** Markdown. Sanitized at render time, never on write. */
  body: string
  category: DiscussionCategory
  status: DiscussionStatus
  createdAt: string
  updatedAt: string
  comments: RecipeDiscussionComment[]
}
