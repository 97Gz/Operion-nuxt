export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return

  const authStore = useAuthStore()

  // Pinia 水合可能覆盖 state，从 localStorage 恢复
  if (!authStore.accessToken && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('auth')
      if (raw) {
        const stored = JSON.parse(raw)
        if (stored.accessToken && stored.user) {
          authStore.$patch({
            accessToken: stored.accessToken,
            refreshToken: stored.refreshToken ?? null,
            expiresAt: stored.expiresAt ?? null,
            user: stored.user
          })
        }
      }
    } catch {
      // 静默处理：认证恢复失败将被后续登录检查捕获
    }
  }

  if (to.path === '/login') {
    if (authStore.isLoggedIn) return navigateTo('/')
    return
  }

  if (!authStore.isLoggedIn) {
    return navigateTo('/login')
  }
})
