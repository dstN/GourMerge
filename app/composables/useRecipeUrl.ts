/**
 * useRecipeUrl — Generate GitHub-style recipe URLs
 *
 * Usage: const url = useRecipeUrl('testkoch', 'omas-apfelkuchen')
 * Returns: '/testkoch/omas-apfelkuchen'
 */
export function useRecipeUrl(username: string, slug: string) {
  return `/${username}/${slug}`
}
