import { defineStore } from 'pinia'
import type { UserInfo } from '~~/shared/types/api'
import { authApi } from '~/api/auth'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  expiresAt: string | null
  user: UserInfo | null
}

const STORAGE_KEY = 'auth'

function loadState(): AuthState {
  if (typeof localStorage === 'undefined') {
    return { accessToken: null, refreshToken: null, expiresAt: null, user: null }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { accessToken: null, refreshToken: null, expiresAt: null, user: null }
    return JSON.parse(raw) as AuthState
  } catch {
    return { accessToken: null, refreshToken: null, expiresAt: null, user: null }
  }
}

function saveState(state: AuthState) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => loadState(),

  getters: {
    isLoggedIn: (state) => !!state.accessToken && !!state.user
  },

  actions: {
    async login(username: string, password: string) {
      const api = authApi()
      const res = await api.login({ username, password })
      this.accessToken = res.accessToken
      this.refreshToken = res.refreshToken
      this.expiresAt = res.expiresAt
      this.user = res.user
      saveState(this.$state)
    },

    async register(username: string, email: string, password: string) {
      const api = authApi()
      const res = await api.register({ username, email, password })
      this.accessToken = res.accessToken
      this.refreshToken = res.refreshToken
      this.expiresAt = res.expiresAt
      this.user = res.user
      saveState(this.$state)
    },

    async logout() {
      if (this.refreshToken) {
        try {
          const api = authApi()
          await api.logout(this.refreshToken)
        } catch {}
      }
      this.$reset()
      localStorage.removeItem(STORAGE_KEY)
      navigateTo('/login')
    },

    async tryRestoreSession() {
      if (!this.accessToken) return false
      try {
        const api = authApi()
        const user = await api.me()
        this.user = user
        saveState(this.$state)
        return true
      } catch {
        this.$reset()
        localStorage.removeItem(STORAGE_KEY)
        return false
      }
    },

    $reset() {
      this.accessToken = null
      this.refreshToken = null
      this.expiresAt = null
      this.user = null
    }
  }
})
