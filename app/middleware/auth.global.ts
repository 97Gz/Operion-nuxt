export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return

  const authStore = useAuthStore()

  // @pinia/nuxt 水合可能覆盖 state，从 localStorage 恢复
  if (!authStore.accessToken && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('auth')
      console.error(`[auth-restore] raw=${raw ? 'exists' : 'null'} storeToken=${!!authStore.accessToken}`)
      if (raw) {
        const stored = JSON.parse(raw)
        console.error(`[auth-restore] parsed token=${!!stored.accessToken} user=${!!stored.user}`)
        if (stored.accessToken && stored.user) {
          authStore.$patch({
            accessToken: stored.accessToken,
            refreshToken: stored.refreshToken ?? null,
            expiresAt: stored.expiresAt ?? null,
            user: stored.user,
          })
          console.error(`[auth-restore] After patch: isLoggedIn=${authStore.isLoggedIn}`)
        }
      }
    } catch (e) {
      console.error(`[auth-restore] Error:`, e)
    }
  }

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
