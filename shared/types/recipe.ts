import type { CommitDiff } from '~~/shared/types'

export interface RecipeDetail {
  id: number
  title: string
  slug: string
  description: string | null
  visibility: 'public' | 'private'
  servings: number
  prepTimeMinutes: number | null
  cookTimeMinutes: number | null
  difficulty: 'easy' | 'medium' | 'hard'
  starCount: number
  forkCount: number
  forkedFromRecipeId: number | null
  createdAt: string
  updatedAt: string
  owner: { id: number; username: string; displayName: string | null; avatarUrl: string | null }
  branches: Array<{ id: number; recipeId: number; name: string; headCommitId: number | null; isDefault: boolean; createdAt: string }>
  defaultBranch: { id: number; recipeId: number; name: string; headCommitId: number | null; isDefault: boolean; createdAt: string } | undefined
  currentIngredients: Array<{ id: number; ingredientId: number; ingredientName: string; quantity: string; unit: string; notes: string | null; sortOrder: number }>
  currentSteps: Array<{ id: number; commitId: number; sortOrder: number; content: string }>
  isStarred: boolean
}

export interface UserProfile {
  user: {
    id: number
    username: string
    displayName: string | null
    bio: string | null
    avatarUrl: string | null
    email: string
    preferredLocale: string
    preferredMeasurementSystem: string
    createdAt: string
  }
  recipes: RecipeDetail[]
  starredRecipes: RecipeDetail[]
  isOwnProfile: boolean
}

export interface GourmergeRequestDetail {
  id: number
  title: string
  description: string | null
  status: 'draft' | 'open' | 'closed' | 'merged'
  author: { username: string; displayName: string | null } | undefined
  sourceBranch: { id: number; name: string; headCommitId: number | null; recipeId: number; isDefault: boolean; createdAt: string } | null
  targetBranch: { id: number; name: string; headCommitId: number | null; recipeId: number; isDefault: boolean; createdAt: string } | null
  diff: CommitDiff | null
  canMerge: boolean
  comments: Array<{ id: number; body: string; authorId: number; authorUsername: string; authorDisplayName: string | null; createdAt: string }>
  createdAt: string
  updatedAt: string
}

export interface GourmergeRequestListItem {
  id: number
  title: string
  status: 'draft' | 'open' | 'closed' | 'merged'
  authorDisplayName: string | null
  authorUsername: string
  createdAt: string
}

export interface ExploreRecipe {
  id: number
  title: string
  slug: string
  description: string | null
  difficulty: string
  servings: number
  prepTimeMinutes: number | null
  cookTimeMinutes: number | null
  visibility: string
  starCount: number
  forkCount: number
  forkedFromRecipeId: number | null
  createdAt: string
  ownerUsername: string
  ownerDisplayName: string | null
  ownerAvatarUrl: string | null
  owner: { username: string }
}

export interface ExploreResponse {
  recipes: ExploreRecipe[]
  total: number
  page: number
  limit: number
}

export interface DashboardRecipe {
  id: number
  title: string
  slug: string
  description: string | null
  visibility: string
  servings: number
  prepTimeMinutes: number | null
  cookTimeMinutes: number | null
  difficulty: string
  starCount: number
  forkCount: number
  createdAt: string
  owner: { id: number; username: string; displayName: string | null; avatarUrl: string | null }
}
