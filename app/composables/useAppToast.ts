/**
 * useAppToast — thin wrapper around Nuxt UI's useToast
 * with pre-configured success/error/info helpers.
 */
export function useAppToast() {
  const toast = useToast()

  return {
    success(title: string, description?: string) {
      toast.add({ title, description, icon: 'i-lucide-check-circle', color: 'success' })
    },
    error(title: string, description?: string) {
      toast.add({ title, description, icon: 'i-lucide-alert-circle', color: 'error' })
    },
    info(title: string, description?: string) {
      toast.add({ title, description, icon: 'i-lucide-info', color: 'info' })
    },
  }
}
