export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return

  const authStore = useAuthStore()

  if (to.path === '/login') {
    if (authStore.isLoggedIn) {
      return navigateTo('/')
    }
    return
  }

  if (!authStore.isLoggedIn) {
    return navigateTo('/login')
  }
})
